import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, createApp } from './app.js';

describe('active API', () => {
  it('reports process health without exposing configuration', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns supported public model metadata', async () => {
    const response = await request(createApp()).get('/api/models');
    expect(response.status).toBe(200);
    expect(response.body.models.map((model) => model.provider)).toEqual(['openai', 'gemini', 'anthropic']);
    expect(response.body.models.every((model) => !Object.hasOwn(model, 'apiKey'))).toBe(true);
  });

  it('does not offer the old server-side PostgreSQL conversation routes', async () => {
    const response = await request(app).get('/api/conversations');
    expect(response.status).toBe(404);
  });
});
