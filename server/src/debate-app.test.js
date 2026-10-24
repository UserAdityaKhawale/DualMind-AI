import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from './config.js';
import { createDebateApp } from './debate-app.js';

const reviewText = JSON.stringify({ assessment: 'Useful but unverified.', strengths: ['Clear'], missingInformation: [], potentialConcerns: [], logicalWeaknesses: [], clarityIssues: [], corrections: [], confidence: 'medium', uncertainty: 'Needs independent evidence.' });
const adapters = {
  generate: vi.fn(async (modelId, prompt) => ({ text: `${modelId} answer to ${prompt}`, model: modelId, usage: { inputTokens: 4, outputTokens: 8 }, durationMs: 5 })),
  streamGenerate: vi.fn(async (modelId, prompt, onDelta) => { onDelta('Live '); onDelta(`answer to ${prompt}`); return { model: modelId, usage: { inputTokens: 3, outputTokens: 6 } }; }),
  review: vi.fn(async (modelId, prompt, answer, targetModel) => ({ text: reviewText, model: modelId, usage: null, durationMs: 6, answer, targetModel })),
  synthesize: vi.fn(async (modelId, input) => ({ text: `Synthesis by ${modelId} from ${input.results.length} answers`, model: modelId, usage: null, durationMs: 7 })),
};
const adapterFactory = vi.fn(() => adapters);
const createTestApp = () => createDebateApp({ appConfig: config, adapterFactory });

beforeEach(() => { vi.clearAllMocks(); });

describe('Multi-model API foundation', () => {
  it('exposes only public provider and model metadata', async () => {
    const response = await request(createTestApp()).get('/api/models');
    expect(response.status).toBe(200);
    expect(response.body.models.map(({ provider }) => provider)).toEqual(['openai', 'gemini', 'anthropic']);
    expect(response.body).toMatchObject({ maxSelectedModels: 4, maxParallelRequests: 4 });
    expect(response.body.providers.every((provider) => !Object.hasOwn(provider, 'apiKey'))).toBe(true);
  });

  it('sends a per-request credential to one generation and never returns it', async () => {
    const response = await request(createTestApp()).post('/api/generate').send({ prompt: 'Question', modelId: 'gpt-5.5', apiKey: 'test-secret-key' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'success', provider: 'openai', model: 'gpt-5.5' });
    expect(adapterFactory).toHaveBeenCalledWith(config, { openai: 'test-secret-key' });
    expect(JSON.stringify(response.body)).not.toContain('test-secret-key');
  });

  it('streams answer deltas and completion metadata without echoing the key', async () => {
    const response = await request(createTestApp()).post('/api/generate/stream').set('Accept', 'text/event-stream').send({ prompt: 'Question', modelId: 'gpt-5.5', apiKey: 'stream-secret' });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('event: delta\ndata: {"text":"Live "}');
    expect(response.text).toContain('event: delta\ndata: {"text":"answer to Question"}');
    expect(response.text).toContain('event: done\ndata: {"modelId":"gpt-5.5"');
    expect(response.text).not.toContain('stream-secret');
    expect(adapters.streamGenerate).toHaveBeenCalledWith('gpt-5.5', 'Question', expect.any(Function));
  });

  it('rejects unsupported models and malformed prompts before provider calls', async () => {
    const app = createTestApp();
    const unsupported = await request(app).post('/api/generate').send({ prompt: 'x', modelId: 'fake-model', apiKey: 'secret' });
    const malformed = await request(app).post('/api/generate').send({ prompt: '', modelId: 'gpt-5.5', apiKey: 'secret', extra: true });
    expect(unsupported.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(adapters.generate).not.toHaveBeenCalled();
  });

  it('normalizes reviewers and prevents self-review', async () => {
    const app = createTestApp();
    const self = await request(app).post('/api/review').send({ prompt: 'Question', modelId: 'gpt-5.5', apiKey: 'secret', answer: 'Answer', targetModel: 'gpt-5.5' });
    const review = await request(app).post('/api/review').send({ prompt: 'Question', modelId: 'gpt-5.5', apiKey: 'secret', answer: 'Gemini answer', targetModel: 'gemini-3.8-flash' });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_REVIEW_NOT_ALLOWED');
    expect(review.status).toBe(200);
    expect(review.body.review).toMatchObject({ assessment: 'Useful but unverified.', confidence: 'medium' });
    expect(adapters.review).toHaveBeenCalledWith('gpt-5.5', 'Question', 'Gemini answer', 'gemini-3.8-flash');
  });

  it('synthesizes from available answers and identifies review coverage', async () => {
    const response = await request(createTestApp()).post('/api/synthesize').send({
      prompt: 'Question', modelId: 'gemini-3.8-flash', apiKey: 'secret',
      results: [{ modelId: 'gemini-3.8-flash', text: 'Gemini answer' }],
      reviews: [{ reviewerModel: 'gpt-5.5', targetModel: 'gemini-3.8-flash', status: 'error', review: null }],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'success', provider: 'gemini', text: 'Synthesis by gemini-3.8-flash from 1 answers', reviewCoverage: { completed: 0, total: 1 } });
  });

  it('sets no-store headers so per-request key material is not cached', async () => {
    const response = await request(createTestApp()).get('/api/health');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
