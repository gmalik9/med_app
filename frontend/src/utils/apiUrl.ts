// Never guess another service's hostname: authentication tokens must go only to
// an explicitly configured backend, or the same-origin /api reverse proxy.
export function resolveApiUrl(configured?: string): string {
  if (!configured || configured === 'undefined') return '';
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an HTTP(S) origin without a path or credentials');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote API requires HTTPS');
  return url.origin;
}