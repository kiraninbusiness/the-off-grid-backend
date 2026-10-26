import crypto from 'node:crypto';

// Pure helpers for app error reports, kept free of database and web-framework
// imports so they can be unit tested on their own.

export const ERROR_SOURCES = ['render', 'js', 'promise', 'native'];
export const ERROR_PLATFORMS = ['ios', 'android', 'web'];

// Plain text only: drop control characters (keep newlines), trim and cap the length.
// Reports are stored and returned as JSON, never rendered as HTML.
export function clip(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** Returns a clean report, or null when there is no usable error message. */
export function normalizeErrorReport(body) {
  const b = body && typeof body === 'object' ? body : {};
  const message = clip(b.message, 500);
  if (!message) return null;
  const platform = String(b.platform ?? '').toLowerCase();
  return {
    message,
    stack: clip(b.stack, 4000),
    source: ERROR_SOURCES.includes(b.source) ? b.source : 'js',
    screen: clip(b.screen, 120),
    app_version: clip(b.app_version, 30),
    platform: ERROR_PLATFORMS.includes(platform) ? platform : 'unknown',
    os_version: clip(b.os_version, 30),
    fatal: b.fatal === true,
  };
}

/** Groups the same error together: message plus the first line of the stack. */
export function errorFingerprint(report) {
  const firstStackLine = String(report.stack || '').split('\n')[0] || '';
  return crypto.createHash('sha1').update(`${report.message}|${firstStackLine}`).digest('hex').slice(0, 16);
}
