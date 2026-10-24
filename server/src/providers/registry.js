export const PROVIDERS = Object.freeze({
  openai: { id: 'openai', name: 'OpenAI', credentialLabel: 'OpenAI API key' },
  gemini: { id: 'gemini', name: 'Google Gemini', credentialLabel: 'Gemini API key' },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude', credentialLabel: 'Anthropic API key' },
});

export const MODEL_REGISTRY = Object.freeze([
  { id: 'gpt-5.5', provider: 'openai', name: 'GPT-5.5', capabilities: ['text', 'review', 'synthesis', 'streaming'] },
  { id: 'gemini-3.8-flash', provider: 'gemini', name: 'Gemini 3.8 Flash', capabilities: ['text', 'review', 'synthesis', 'streaming'] },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', name: 'Claude Sonnet 4.6', capabilities: ['text', 'review', 'synthesis', 'streaming'] },
]);

export const getModel = (id) => MODEL_REGISTRY.find((model) => model.id === id) ?? null;
