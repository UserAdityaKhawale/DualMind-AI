import { describe, expect, it } from 'vitest';
import { buildReviewPairs, orderSynthesizerCandidates } from '../../client/src/debate.js';
import { toHistoryRecord } from '../../client/src/history.js';

describe('browser debate planning', () => {
  it('creates N times N minus one directed peer reviews without self-review', () => {
    const selected = ['gpt-5.5', 'gemini-3.8-flash', 'claude-sonnet-4-6'];
    const results = selected.map((modelId) => ({ modelId, status: 'success', text: `${modelId} answer` }));
    const pairs = buildReviewPairs(selected, results);
    expect(pairs).toHaveLength(6);
    expect(pairs.every(({ reviewerModel, targetModel }) => reviewerModel !== targetModel)).toBe(true);
  });

  it('reviews only successful targets and skips reviews already completed successfully', () => {
    const selected = ['gpt-5.5', 'gemini-3.8-flash', 'claude-sonnet-4-6'];
    const results = [
      { modelId: selected[0], status: 'success', text: 'GPT answer' },
      { modelId: selected[1], status: 'success', text: 'Gemini answer' },
      { modelId: selected[2], status: 'error', text: null },
    ];
    const completed = [{ reviewerModel: selected[0], targetModel: selected[1], status: 'success' }];
    const pairs = buildReviewPairs(selected, results, completed);
    expect(pairs).toHaveLength(3);
    expect(pairs.some(({ reviewerModel, targetModel }) => reviewerModel === selected[0] && targetModel === selected[1])).toBe(false);
    expect(pairs.some(({ targetModel }) => targetModel === selected[2])).toBe(false);
  });

  it('prefers successful original-answer models, then eligible fallbacks, in selection order', () => {
    const models = [{ id: 'gpt-5.5' }, { id: 'gemini-3.8-flash' }, { id: 'claude-sonnet-4-6' }];
    expect(orderSynthesizerCandidates(models, ['gemini-3.8-flash'])).toEqual([models[1], models[0], models[2]]);
    expect(orderSynthesizerCandidates(models, ['gemini-3.8-flash'], 'claude-sonnet-4-6')).toEqual([models[2], models[0], models[1]]);
  });

  it('stores only the approved debate fields and excludes session credentials', () => {
    const run = { id: 'run-1', prompt: 'Question', selectedModels: ['gpt-5.5'], results: [], reviews: [], synthesis: null, status: 'complete', createdAt: '2026-10-25T00:00:00.000Z', credentials: { openai: 'must-not-persist' }, apiKey: 'also-secret' };
    const stored = toHistoryRecord(run);
    expect(stored).toMatchObject({ id: 'run-1', prompt: 'Question', selectedModels: ['gpt-5.5'] });
    expect(JSON.stringify(stored)).not.toContain('must-not-persist');
    expect(JSON.stringify(stored)).not.toContain('also-secret');
  });
});
