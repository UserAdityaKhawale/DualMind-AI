export class ProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProviderError';
    this.code = code;
  }
}

export function toPublicProviderError(error) {
  const status = error?.status;
  const code = error?.code;
  const type = error?.type;
  if (code === 'NOT_CONFIGURED') {
    return { status: 'error', error: { code, message: 'This provider is not configured on the server.' } };
  }
  if (code === 'EMPTY_RESPONSE') {
    return { status: 'error', error: { code, message: 'The provider returned no text. Try again.' } };
  }
  if (type === 'insufficient_quota' || code === 'credit_balance_exhausted' || code === 'insufficient_quota') {
    return { status: 'error', error: { code: 'PROVIDER_CREDITS_EXHAUSTED', message: 'This provider account has no API credits available. Check its billing or usage limits.' } };
  }
  if (status === 429) {
    return { status: 'error', error: { code: 'PROVIDER_RATE_LIMITED', message: 'The provider is rate limiting requests. Try again shortly.' } };
  }
  if (status === 401 || status === 403) {
    return { status: 'error', error: { code: 'PROVIDER_AUTH', message: 'The provider rejected its server credentials.' } };
  }
  if (error?.name === 'APIConnectionTimeoutError' || error?.name === 'TimeoutError' || error?.name === 'AbortError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code) || /timed? ?out|deadline exceeded/i.test(error?.message ?? '')) {
    return { status: 'timeout', error: { code: 'PROVIDER_TIMEOUT', message: 'The provider took too long to respond. Try again.' } };
  }
  if (code === 'MODEL_UNSUPPORTED' || status === 404) {
    return { status: 'error', error: { code: 'MODEL_UNAVAILABLE', message: 'This model is unavailable for the configured provider key.' } };
  }
  if (['EACCES', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'].includes(code) || error?.cause?.code === 'EACCES') {
    return { status: 'error', error: { code: 'PROVIDER_CONNECTION', message: 'The server could not connect to the provider. Check network access and try again.' } };
  }
  return { status: 'error', error: { code: 'PROVIDER_UNAVAILABLE', message: 'This provider could not complete the request. Try again shortly.' } };
}
