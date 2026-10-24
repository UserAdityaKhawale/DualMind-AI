export async function saveComparison(pool, { prompt, results }) {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const title = (prompt.split(/\r?\n/, 1)[0] || prompt).slice(0, 200).trim();
    const models = Object.fromEntries(Object.entries(results).map(([provider, result]) => [provider, result.model]));
    const conversation = await client.query(
      'INSERT INTO conversations (title, model_config) VALUES ($1, $2::jsonb) RETURNING id, created_at',
      [title || 'AI comparison', JSON.stringify(models)],
    );
    const conversationId = conversation.rows[0].id;
    await client.query(
      'INSERT INTO messages (conversation_id, role, stage, content, status) VALUES ($1, $2, $3, $4, $5)',
      [conversationId, 'user', 'prompt', prompt, 'success'],
    );
    for (const provider of ['openai', 'gemini']) {
      const result = results[provider];
      await client.query(
        'INSERT INTO messages (conversation_id, role, stage, provider, content, usage_json, duration_ms, status, metadata_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)',
        [conversationId, 'assistant', result.status === 'success' ? 'draft' : 'error', provider, result.text ?? result.error.message, JSON.stringify(result.usage ?? {}), result.durationMs, result.status, JSON.stringify({ model: result.model ?? null, error: result.error ?? null })],
      );
    }
    await client.query('COMMIT');
    return { id: String(conversationId), createdAt: conversation.rows[0].created_at };
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function inTransaction(pool, callback) {
  const client = await pool.connect();
  let started = false;
  try {
    await client.query('BEGIN');
    started = true;
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (started) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function saveReviews(pool, conversationId, reviews) {
  return inTransaction(pool, async (client) => {
    for (const reviewer of ['openai', 'gemini']) {
      const item = reviews[reviewer];
      await client.query(
        "INSERT INTO messages (conversation_id, role, stage, provider, subject_provider, content, status, usage_json, duration_ms, metadata_json) VALUES ($1, 'assistant', 'review', $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb) ON CONFLICT (conversation_id, stage, provider, subject_provider) WHERE stage = 'review' DO UPDATE SET content = EXCLUDED.content, status = EXCLUDED.status, usage_json = EXCLUDED.usage_json, duration_ms = EXCLUDED.duration_ms, metadata_json = EXCLUDED.metadata_json, created_at = now()",
        [conversationId, reviewer, item.reviewedProvider, JSON.stringify(item.review ?? { error: item.error }), item.status, JSON.stringify(item.usage ?? {}), item.durationMs ?? null, JSON.stringify({ model: item.model ?? null, error: item.error ?? null })],
      );
    }
    await client.query("UPDATE conversations SET workflow_status = 'reviewed', updated_at = now() WHERE id = $1", [conversationId]);
  });
}

export function saveSynthesis(pool, conversationId, synthesis) {
  return inTransaction(pool, async (client) => {
    await client.query(
      "INSERT INTO messages (conversation_id, role, stage, provider, content, status, usage_json, duration_ms, metadata_json) VALUES ($1, 'assistant', 'synthesis', $2, $3, $4, $5::jsonb, $6, $7::jsonb) ON CONFLICT (conversation_id, stage) WHERE stage = 'synthesis' DO UPDATE SET provider = EXCLUDED.provider, content = EXCLUDED.content, status = EXCLUDED.status, usage_json = EXCLUDED.usage_json, duration_ms = EXCLUDED.duration_ms, metadata_json = EXCLUDED.metadata_json, created_at = now()",
      [conversationId, synthesis.provider, synthesis.text ?? JSON.stringify({ error: synthesis.error }), synthesis.status, JSON.stringify(synthesis.usage ?? {}), synthesis.durationMs ?? null, JSON.stringify({ model: synthesis.model ?? null, crossReviewComplete: synthesis.crossReviewComplete, error: synthesis.error ?? null })],
    );
    await client.query("UPDATE conversations SET workflow_status = $2, updated_at = now() WHERE id = $1", [conversationId, synthesis.status === 'success' ? 'complete' : 'partial']);
  });
}

export async function listConversations(pool) {
  const result = await pool.query('SELECT id, title, workflow_status, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC LIMIT 100');
  return result.rows.map((row) => ({ id: String(row.id), title: row.title, workflowStatus: row.workflow_status, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function getConversation(pool, id) {
  const conversation = await pool.query('SELECT id, title, workflow_status, created_at, updated_at FROM conversations WHERE id = $1', [id]);
  if (!conversation.rows.length) return null;
  const messages = await pool.query('SELECT role, stage, provider, subject_provider, content, status, usage_json, duration_ms, metadata_json, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at, id', [id]);
  const row = conversation.rows[0];
  const data = { id: String(row.id), title: row.title, workflowStatus: row.workflow_status, createdAt: row.created_at, updatedAt: row.updated_at, prompt: '', results: {}, reviews: {}, synthesis: null, persistence: { status: 'saved', conversationId: String(row.id) } };
  for (const message of messages.rows) {
    const metadata = message.metadata_json ?? {};
    if (message.stage === 'prompt') data.prompt = message.content;
    else if (message.stage === 'draft' || message.stage === 'error') {
      data.results[message.provider] = { provider: message.provider, status: message.status, text: message.status === 'success' ? message.content : null, error: metadata.error ?? (message.status === 'success' ? null : { code: 'PROVIDER_UNAVAILABLE', message: message.content }), model: metadata.model ?? null, usage: message.usage_json, durationMs: message.duration_ms };
    } else if (message.stage === 'review') {
      let review = null;
      try { const parsed = JSON.parse(message.content); if (!parsed.error) review = parsed; } catch {}
      data.reviews[message.provider] = { provider: message.provider, reviewedProvider: message.subject_provider, status: message.status, review, error: metadata.error ?? null, model: metadata.model ?? null, usage: message.usage_json, durationMs: message.duration_ms };
    } else if (message.stage === 'synthesis') {
      let text = message.content;
      if (message.status !== 'success') { try { text = JSON.parse(message.content).error?.message ?? message.content; } catch {} }
      data.synthesis = { status: message.status, provider: message.provider, text: message.status === 'success' ? text : null, error: metadata.error ?? (message.status === 'success' ? null : { code: 'PROVIDER_UNAVAILABLE', message: text }), model: metadata.model ?? null, usage: message.usage_json, durationMs: message.duration_ms, crossReviewComplete: metadata.crossReviewComplete ?? false };
    }
  }
  return data;
}
