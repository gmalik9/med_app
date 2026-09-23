'use strict';

// Shared by Node scripts and TypeScript integration suites. Never echo the URL.
exports.requireAuditDatabase = function requireAuditDatabase(env = process.env) {
  const value = env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required; integration tests must not skip. See SETUP.md.');
  try {
    const url = new URL(value);
    const password = decodeURIComponent(url.password);
    if (typeof value !== 'string' || url.protocol !== 'postgresql:' || url.username !== 'audit' ||
      url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/medapp_audit' ||
      !password || /[\r\n\0]/.test(password) || /^<.*>$/.test(password) || url.search || url.hash ||
      value !== `postgresql://audit:${url.password}@127.0.0.1:55439/medapp_audit`) throw new Error();
    return value;
  } catch {
    throw new Error('TEST_DATABASE_URL refused: requires the exact loopback audit user, port 55439, medapp_audit database and a supplied password, with no URL overrides (value redacted).');
  }
};
