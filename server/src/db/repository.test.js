import { describe, expect, it, vi } from 'vitest';
import { getConversation, listConversations, saveComparison, saveReviews, saveSynthesis } from './repository.js';

describe('saveComparison', () => {
  it('stores a prompt and both provider results transactionally with parameterized queries', async () => {
    const calls = [];
    const client = {
      query: vi.fn(async (sql, values) => {
        calls.push({ sql, values });
        if (sql.startsWith('INSERT INTO conversations')) return { rows: [{ id: '41', created_at: '2026-10-21T00:00:00.000Z' }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const result = await saveComparison(pool, {
      prompt: 'A useful question',
      results: {
        openai: { model: 'o-test', status: 'success', text: 'First answer', usage: { inputTokens: 2 }, durationMs: 25 },
        gemini: { model: 'g-test', status: 'error', text: null, error: { message: 'Provider not configured' }, usage: null, durationMs: 30 },
      },
    });

    expect(result.id).toBe('41');
    expect(calls[0].sql).toBe('BEGIN');
    expect(calls.at(-1).sql).toBe('COMMIT');
    expect(calls.filter(({ sql }) => sql.startsWith('INSERT INTO messages'))).toHaveLength(3);
    expect(calls[1].values[0]).toBe('A useful question');
    expect(calls.some(({ sql }) => /\$[1-9]/.test(sql))).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection if an insert fails', async () => {
    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        queries.push(sql);
        if (sql.startsWith('INSERT INTO conversations')) return { rows: [{ id: '42', created_at: new Date() }] };
        if (sql.startsWith('INSERT INTO messages')) throw new Error('insert failed');
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    await expect(saveComparison({ connect: async () => client }, {
      prompt: 'Question', results: {
        openai: { model: 'o', status: 'success', text: 'answer', usage: null, durationMs: 2 },
        gemini: { model: 'g', status: 'success', text: 'answer', usage: null, durationMs: 3 },
      },
    })).rejects.toThrow('insert failed');
    expect(queries).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('workflow persistence and history reads', () => {
  it('upserts both reviews and synthesis in transactions with parameterized values', async () => {
    const calls = [];
    const client = { query: vi.fn(async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; }), release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const reviews = {
      openai: { reviewedProvider: 'gemini', status: 'success', review: { assessment: 'Review', strengths: [] }, error: null, usage: null, durationMs: 5 },
      gemini: { reviewedProvider: 'openai', status: 'error', review: null, error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out' }, usage: null, durationMs: 6 },
    };
    await saveReviews(pool, '8', reviews);
    await saveSynthesis(pool, '8', { provider: 'openai', status: 'success', text: 'Final', usage: null, durationMs: 8 });
    expect(calls.filter(({ sql }) => sql.includes("'review'")).length).toBe(2);
    expect(calls.some(({ sql }) => sql.includes("'synthesis'") && sql.includes('ON CONFLICT'))).toBe(true);
    expect(calls.some(({ values }) => values?.includes('8'))).toBe(true);
    expect(calls.filter(({ sql }) => sql === 'COMMIT')).toHaveLength(2);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('lists newest conversations and reconstructs saved workflow stages without writes', async () => {
    const pool = {
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT id, title, workflow_status')) return { rows: [{ id: '9', title: 'Question', workflow_status: 'complete', created_at: 'created', updated_at: 'updated' }] };
        if (sql.startsWith('SELECT role, stage')) return { rows: [
          { stage: 'prompt', content: 'Question', status: 'success' },
          { stage: 'draft', provider: 'openai', content: 'Original answer', status: 'success', metadata_json: { model: 'o' }, usage_json: {}, duration_ms: 3 },
          { stage: 'review', provider: 'gemini', subject_provider: 'openai', content: JSON.stringify({ assessment: 'Looks useful', strengths: [] }), status: 'success', metadata_json: {}, usage_json: {}, duration_ms: 4 },
          { stage: 'synthesis', provider: 'openai', content: 'Final answer', status: 'success', metadata_json: { crossReviewComplete: false }, usage_json: {}, duration_ms: 5 },
        ] };
        return { rows: [] };
      }),
    };
    const listed = await listConversations(pool);
    const opened = await getConversation(pool, '9');
    expect(listed[0]).toMatchObject({ id: '9', title: 'Question', workflowStatus: 'complete' });
    expect(opened).toMatchObject({ prompt: 'Question', persistence: { status: 'saved', conversationId: '9' }, results: { openai: { text: 'Original answer' } }, reviews: { gemini: { reviewedProvider: 'openai', review: { assessment: 'Looks useful' } } }, synthesis: { text: 'Final answer', crossReviewComplete: false } });
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it('returns null for missing conversations', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(getConversation(pool, '404')).resolves.toBeNull();
    expect(pool.query).toHaveBeenCalledOnce();
  });
});
