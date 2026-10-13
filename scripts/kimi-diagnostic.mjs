// Return fixed, safe guidance. Never print a provider message, prompt, key or identifier.
export function kimiDiagnostic(status, body) {
  const type = body?.error?.type;
  if (type === 'engine_overloaded_error')
    return 'Kimi service is overloaded. Wait and retry later; topping up does not resolve provider overload.';
  if (type === 'exceeded_current_quota_error' || type === 'insufficient_quota')
    return 'Account quota/balance unavailable. Check API billing, available credits and voucher expiry on the platform that issued this key; repeated retries will not fix this.';
  if (type === 'rate_limit_reached_error' || type === 'rate_limit_error')
    return 'Provider rate/concurrency limit reached. Pause requests, then retry once; review the account request/token limits.';
  if (status === 429)
    return 'Provider returned 429 without a recognized error type. Check both API credits and request/token limits; HTTP 429 alone does not distinguish them.';
  if (status === 401) return 'Provider rejected authentication. Check that this is a complete Open Platform API key for the configured endpoint.';
  if (status === 403) return 'Provider denied access. Check account permissions, billing and model availability.';
  if (status >= 500) return 'Provider service error. Retry later.';
  return 'Provider completion failed. Check model access and API configuration.';
}
