ALTER TABLE conversations
  ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'answers'
    CHECK (workflow_status IN ('answers', 'reviewed', 'complete', 'partial'));

ALTER TABLE messages
  ADD COLUMN subject_provider TEXT
    CHECK (subject_provider IN ('openai', 'gemini') OR subject_provider IS NULL),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'timeout', 'skipped')),
  ADD COLUMN metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE messages SET status = 'error' WHERE stage = 'error';

CREATE UNIQUE INDEX messages_review_stage_idx
  ON messages (conversation_id, stage, provider, subject_provider)
  WHERE stage = 'review';

CREATE UNIQUE INDEX messages_synthesis_stage_idx
  ON messages (conversation_id, stage)
  WHERE stage = 'synthesis';
