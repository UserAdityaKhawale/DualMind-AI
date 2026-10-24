CREATE TABLE conversations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  debate_depth SMALLINT NOT NULL DEFAULT 1 CHECK (debate_depth BETWEEN 1 AND 3),
  model_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  stage TEXT NOT NULL CHECK (stage IN ('prompt', 'draft', 'review', 'synthesis', 'error')),
  provider TEXT CHECK (provider IN ('openai', 'gemini') OR provider IS NULL),
  content TEXT NOT NULL,
  usage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_updated_at_idx ON conversations (updated_at DESC);
CREATE INDEX messages_conversation_created_at_idx ON messages (conversation_id, created_at, id);
