import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  MAX_PROMPT_CHARS: z.coerce.number().int().min(100).max(50000).default(12000),
  MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(2048),
  MAX_SELECTED_MODELS: z.coerce.number().int().min(2).max(6).default(4),
  MAX_PARALLEL_REQUESTS: z.coerce.number().int().min(1).max(8).default(4),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ')}`);
}

export const config = parsed.data;
