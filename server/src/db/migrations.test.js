import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationFile = (name) => fileURLToPath(new URL(`../../migrations/${name}`, import.meta.url));

describe('PostgreSQL migration files', () => {
  it('start with SQL text and have no UTF-8 BOM that psql may misread', async () => {
    for (const [name, expectedStart] of [['001_initial_schema.sql', 'CREATE TABLE'], ['002_workflow_history.sql', 'ALTER TABLE']]) {
      const contents = await readFile(migrationFile(name));
      expect(contents.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      expect(contents.toString('utf8').startsWith(expectedStart)).toBe(true);
    }
  });
});
