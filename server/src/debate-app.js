import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { parseReview } from './workflow.js';
import { toPublicProviderError } from './providers/errors.js';
import { createRequestAdapters } from './providers/adapters.js';
import { MODEL_REGISTRY, PROVIDERS, getModel } from './providers/registry.js';

const credentialSchema = z.string().trim().min(1).max(4096);
const promptSchema = z.string().trim().min(1).max(config.MAX_PROMPT_CHARS);
const modelSchema = z.string().min(1).max(200).refine((id) => Boolean(getModel(id)), 'Unsupported model');
const commonFields = { prompt: promptSchema, modelId: modelSchema, apiKey: credentialSchema };
const generateSchema = z.object(commonFields).strict();
const reviewSchema = z.object({ ...commonFields, answer: z.string().trim().min(1).max(40000), targetModel: z.string().min(1).max(200) }).strict();
const testSchema = z.object({ modelId: modelSchema, apiKey: credentialSchema }).strict();
const synthesisSchema = z.object({
  ...commonFields,
  results: z.array(z.object({ modelId: modelSchema, text: z.string().trim().min(1).max(40000) }).strict()).min(1).max(config.MAX_SELECTED_MODELS),
  reviews: z.array(z.object({ reviewerModel: modelSchema, targetModel: modelSchema, status: z.enum(['success', 'error', 'timeout']), review: z.unknown().nullable() }).strict()).max(config.MAX_SELECTED_MODELS * (config.MAX_SELECTED_MODELS - 1)),
}).strict();

function resultError(error) {
  const safe = toPublicProviderError(error);
  return { status: safe.status, error: safe.error };
}

export function createDebateApp({ appConfig = config, adapterFactory = createRequestAdapters } = {}) {
  const app = express();
  const operationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many model operations. Wait before retrying.' } }),
  });

  app.disable('x-powered-by');
  app.use(cors({ origin: appConfig.CLIENT_ORIGIN }));
  app.use(express.json({ limit: '768kb' }));
  app.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/models', (_request, response) => response.json({ providers: Object.values(PROVIDERS), models: MODEL_REGISTRY, maxSelectedModels: appConfig.MAX_SELECTED_MODELS, maxParallelRequests: appConfig.MAX_PARALLEL_REQUESTS }));

  app.post('/api/provider-test', operationLimiter, async (request, response) => {
    const parsed = testSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { code: 'INVALID_PROVIDER_TEST', message: 'Select a supported model and provide its API key.' } });
    const { modelId, apiKey } = parsed.data;
    const model = getModel(modelId);
    try {
      const result = await adapterFactory(appConfig, { [model.provider]: apiKey }).generate(modelId, 'Reply with only: OK');
      if (!result.text?.trim()) throw Object.assign(new Error('Empty provider output'), { code: 'EMPTY_RESPONSE' });
      return response.json({ status: 'connected', model: result.model });
    } catch (error) {
      const safe = resultError(error);
      return response.status(502).json({ status: 'failed', error: safe.error });
    }
  });

  app.post('/api/generate', operationLimiter, async (request, response) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { code: 'INVALID_GENERATION_INPUT', message: 'Enter a valid prompt, supported model, and provider key.' } });
    const { prompt, modelId, apiKey } = parsed.data;
    const model = getModel(modelId);
    const startedAt = Date.now();
    try {
      const result = await adapterFactory(appConfig, { [model.provider]: apiKey }).generate(modelId, prompt);
      if (!result.text?.trim()) throw Object.assign(new Error('Empty provider output'), { code: 'EMPTY_RESPONSE' });
      return response.json({ status: 'success', modelId, provider: model.provider, model: result.model, text: result.text, usage: result.usage, durationMs: Date.now() - startedAt });
    } catch (error) {
      const safe = resultError(error);
      console.warn(`${model.provider} generation failed: ${safe.error.code}`);
      return response.status(502).json({ status: safe.status, modelId, provider: model.provider, error: safe.error, durationMs: Date.now() - startedAt });
    }
  });

  app.post('/api/generate/stream', operationLimiter, async (request, response) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { code: 'INVALID_GENERATION_INPUT', message: 'Enter a valid prompt, supported model, and provider key.' } });
    const { prompt, modelId, apiKey } = parsed.data;
    const model = getModel(modelId);
    const startedAt = Date.now();
    response.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    const send = (event, data) => { if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    try {
      const result = await adapterFactory(appConfig, { [model.provider]: apiKey }).streamGenerate(modelId, prompt, (text) => send('delta', { text }));
      send('done', { modelId, provider: model.provider, model: result.model, usage: result.usage, durationMs: Date.now() - startedAt });
    } catch (error) {
      const safe = resultError(error);
      console.warn(`${model.provider} streaming generation failed: ${safe.error.code}`);
      send('error', { status: safe.status, modelId, provider: model.provider, error: safe.error, durationMs: Date.now() - startedAt });
    } finally { response.end(); }
  });

  app.post('/api/review', operationLimiter, async (request, response) => {
    const parsed = reviewSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { code: 'INVALID_REVIEW_INPUT', message: 'Provide the question, another model’s answer, reviewer key, and supported model IDs.' } });
    const { prompt, modelId, apiKey, answer, targetModel } = parsed.data;
    const model = getModel(modelId);
    if (modelId === targetModel) return response.status(400).json({ error: { code: 'SELF_REVIEW_NOT_ALLOWED', message: 'A model cannot review its own answer in the peer-review stage.' } });
    const startedAt = Date.now();
    try {
      const result = await adapterFactory(appConfig, { [model.provider]: apiKey }).review(modelId, prompt, answer, targetModel);
      const review = parseReview(result.text);
      return response.json({ status: 'success', reviewerModel: modelId, targetModel, provider: model.provider, review, usage: result.usage, durationMs: Date.now() - startedAt });
    } catch (error) {
      const safe = resultError(error?.message === 'MALFORMED_OUTPUT' ? Object.assign(new Error(), { code: 'INVALID_REVIEW_OUTPUT' }) : error);
      console.warn(`${model.provider} review failed: ${safe.error.code}`);
      return response.status(502).json({ status: safe.status, reviewerModel: modelId, targetModel, provider: model.provider, error: safe.error, durationMs: Date.now() - startedAt });
    }
  });

  app.post('/api/synthesize', operationLimiter, async (request, response) => {
    const parsed = synthesisSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { code: 'INVALID_SYNTHESIS_INPUT', message: 'Provide a valid question, available answers, reviews, model, and provider key.' } });
    const { prompt, modelId, apiKey, results, reviews } = parsed.data;
    const model = getModel(modelId);
    const startedAt = Date.now();
    try {
      const result = await adapterFactory(appConfig, { [model.provider]: apiKey }).synthesize(modelId, { prompt, results, reviews });
      if (!result.text?.trim()) throw Object.assign(new Error('Empty provider output'), { code: 'EMPTY_RESPONSE' });
      return response.json({ status: 'success', modelId, provider: model.provider, model: result.model, text: result.text, usage: result.usage, durationMs: Date.now() - startedAt, reviewCoverage: { completed: reviews.filter((item) => item.status === 'success').length, total: reviews.length } });
    } catch (error) {
      const safe = resultError(error);
      console.warn(`${model.provider} synthesis failed: ${safe.error.code}`);
      return response.status(502).json({ status: safe.status, modelId, provider: model.provider, error: safe.error, durationMs: Date.now() - startedAt });
    }
  });

  app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested endpoint was not found.' } }));
  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.too.large') return response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'The request body is too large.' } });
    if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' } });
    return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The server could not complete the request.' } });
  });
  return app;
}

export const debateApp = createDebateApp();
