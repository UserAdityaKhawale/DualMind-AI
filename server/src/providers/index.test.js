import { describe, expect, it, vi } from 'vitest';
import { createProviderAdapters, REVIEW_JSON_SCHEMA } from './index.js';
import { toPublicProviderError } from './errors.js';
import { config } from '../config.js';

describe('provider adapters', () => {
  it('normalizes OpenAI generation and usage using request-provided credentials', async () => {
    const create = vi.fn().mockResolvedValue({ output_text: 'Answer', model: 'gpt-5.5', usage: { input_tokens: 7, output_tokens: 11 } });
    const adapters = createProviderAdapters(config, { openai: 'session-key' }, { openai: { responses: { create } } });
    const result = await adapters.generate('gpt-5.5', 'Question');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.5', input: 'Question' }));
    expect(result).toMatchObject({ text: 'Answer', model: 'gpt-5.5', usage: { inputTokens: 7, outputTokens: 11 } });
  });

  it('normalizes Gemini generation and usage', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'Answer', modelVersion: 'gemini-3.8-flash', usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 9 } });
    const adapters = createProviderAdapters(config, { gemini: 'session-key' }, { gemini: { models: { generateContent } } });
    const result = await adapters.generate('gemini-3.8-flash', 'Question');
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.8-flash', contents: 'Question' }));
    expect(result).toMatchObject({ text: 'Answer', usage: { inputTokens: 5, outputTokens: 9 } });
  });

  it('streams and normalizes OpenAI text deltas and final usage', async () => {
    const create = vi.fn(async function* () {
      yield { type: 'response.output_text.delta', delta: 'Hello ' };
      yield { type: 'response.output_text.delta', delta: 'world' };
      yield { type: 'response.completed', response: { model: 'gpt-5.5', usage: { input_tokens: 2, output_tokens: 3 } } };
    });
    const adapters = createProviderAdapters(config, { openai: 'session-key' }, { openai: { responses: { create } } });
    const deltas = [];
    const result = await adapters.streamGenerate('gpt-5.5', 'Question', (delta) => deltas.push(delta));
    expect(deltas.join('')).toBe('Hello world');
    expect(result).toMatchObject({ model: 'gpt-5.5', usage: { inputTokens: 2, outputTokens: 3 } });
  });

  it('streams Gemini text and retains final usage metadata', async () => {
    const generateContentStream = vi.fn(async () => (async function* () {
      yield { text: 'Gemini ', modelVersion: 'gemini-3.8-flash' };
      yield { text: 'answer', modelVersion: 'gemini-3.8-flash', usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 5 } };
    })());
    const adapters = createProviderAdapters(config, { gemini: 'session-key' }, { gemini: { models: { generateContentStream } } });
    const deltas = [];
    const result = await adapters.streamGenerate('gemini-3.8-flash', 'Question', (delta) => deltas.push(delta));
    expect(deltas.join('')).toBe('Gemini answer');
    expect(result).toMatchObject({ model: 'gemini-3.8-flash', usage: { inputTokens: 4, outputTokens: 5 } });
  });

  it('parses Anthropic streaming text and usage events', async () => {
    const body = [
      'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":6}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude answer"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
    ].join('');
    const fetch = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const adapters = createProviderAdapters(config, { anthropic: 'session-key' }, { fetch });
    const deltas = [];
    const result = await adapters.streamGenerate('claude-sonnet-4-6', 'Question', (delta) => deltas.push(delta));
    expect(deltas.join('')).toBe('Claude answer');
    expect(result).toMatchObject({ model: 'claude-sonnet-4-6', usage: { inputTokens: 6, outputTokens: 7 } });
  });

  it('formats OpenAI peer reviews using the required strict schema', async () => {
    const create = vi.fn().mockResolvedValue({ output_text: '{}', model: 'gpt-5.5' });
    const adapters = createProviderAdapters(config, { openai: 'session-key' }, { openai: { responses: { create } } });
    await adapters.review('gpt-5.5', 'Question', 'Other answer', 'gemini-3.8-flash');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ text: { format: { type: 'json_schema', name: 'peer_review', strict: true, schema: REVIEW_JSON_SCHEMA } } }));
  });

  it('uses the official Anthropic Messages endpoint and normalizes its response without echoing the key', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'Claude answer' }], usage: { input_tokens: 3, output_tokens: 6 } }) }));
    const adapters = createProviderAdapters(config, { anthropic: 'session-key' }, { fetch });
    const result = await adapters.generate('claude-sonnet-4-6', 'Question');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('session-key');
    expect(JSON.stringify(result)).not.toContain('session-key');
    expect(result).toMatchObject({ text: 'Claude answer', usage: { inputTokens: 3, outputTokens: 6 } });
  });

  it('reports exhausted OpenAI credits as a billing issue rather than generic rate limiting', () => {
    expect(toPublicProviderError(Object.assign(new Error('private provider body'), { status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota' }))).toMatchObject({ error: { code: 'PROVIDER_CREDITS_EXHAUSTED' } });
  });

  it('does not create a provider client when a per-request key is absent', async () => {
    const adapters = createProviderAdapters(config, {});
    await expect(adapters.generate('gpt-5.5', 'Question')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});
