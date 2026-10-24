import { z } from 'zod';

const itemList = z.array(z.string().trim().min(1).max(1000)).max(12);
export const reviewSchema = z.object({
  assessment: z.string().trim().min(1).max(2000),
  strengths: itemList,
  missingInformation: itemList,
  potentialConcerns: itemList,
  logicalWeaknesses: itemList,
  clarityIssues: itemList,
  corrections: itemList,
  confidence: z.enum(['low', 'medium', 'high']),
  uncertainty: z.string().trim().min(1).max(2000),
}).strict();

export function parseReview(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('MALFORMED_OUTPUT');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('MALFORMED_OUTPUT'); }
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success) throw new Error('MALFORMED_OUTPUT');
  return parsed.data;
}

export const workflowResultSchema = z.object({
  provider: z.enum(['openai', 'gemini']).optional(),
  status: z.enum(['success', 'error', 'timeout']),
  text: z.string().max(40000).nullable(),
  model: z.string().max(200).nullable().optional(),
  error: z.object({ code: z.string().max(100), message: z.string().max(500) }).strict().nullable().optional(),
  usage: z.object({ inputTokens: z.number().nullable().optional(), outputTokens: z.number().nullable().optional() }).strict().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
}).strict().refine((result) => result.status === 'success' ? Boolean(result.text?.trim()) : true);

const workflowResultsSchema = z.object({ openai: workflowResultSchema, gemini: workflowResultSchema }).strict()
  .refine((results) => (!results.openai.provider || results.openai.provider === 'openai') && (!results.gemini.provider || results.gemini.provider === 'gemini'));

export const comparisonPayloadSchema = z.object({
  prompt: z.string().trim().min(1).max(12000),
  results: workflowResultsSchema,
}).strict();

const conversationIdSchema = z.string().regex(/^[1-9]\d{0,18}$/).refine((id) => BigInt(id) <= 9223372036854775807n);

export const reviewsPayloadSchema = z.object({
  prompt: z.string().trim().min(1).max(12000),
  results: workflowResultsSchema,
  conversationId: conversationIdSchema.nullable().optional(),
}).strict();

export const synthesisPayloadSchema = z.object({
  prompt: z.string().trim().min(1).max(12000),
  results: workflowResultsSchema,
  reviews: z.object({
    openai: z.object({ provider: z.enum(['openai', 'gemini']).optional(), reviewedProvider: z.enum(['openai', 'gemini']).optional(), status: z.enum(['success', 'error', 'timeout', 'skipped']), review: reviewSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable().optional(), model: z.string().nullable().optional(), usage: z.unknown().optional(), durationMs: z.number().optional() }).strict(),
    gemini: z.object({ provider: z.enum(['openai', 'gemini']).optional(), reviewedProvider: z.enum(['openai', 'gemini']).optional(), status: z.enum(['success', 'error', 'timeout', 'skipped']), review: reviewSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable().optional(), model: z.string().nullable().optional(), usage: z.unknown().optional(), durationMs: z.number().optional() }).strict(),
  }).strict(),
  requestId: z.string().uuid(),
  conversationId: conversationIdSchema.nullable().optional(),
}).strict();
