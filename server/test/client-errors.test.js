import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeErrorReport, errorFingerprint, clip } from '../src/services/clientErrors.js';

test('a report without a message is rejected', () => {
  assert.equal(normalizeErrorReport({}), null);
  assert.equal(normalizeErrorReport(null), null);
  assert.equal(normalizeErrorReport({ message: '   ' }), null);
  assert.equal(normalizeErrorReport('not an object'), null);
});

test('valid reports are cleaned, capped and given safe defaults', () => {
  const r = normalizeErrorReport({
    message: 'x'.repeat(900),
    stack: 'Error: boom\n    at a (file.js:1:1)' + 'y'.repeat(5000),
    source: 'something-unknown',
    platform: 'ANDROID',
    app_version: '3.0.0',
    fatal: 'yes',
  });
  assert.equal(r.message.length, 500);
  assert.equal(r.stack.length, 4000);
  assert.equal(r.source, 'js');
  assert.equal(r.platform, 'android');
  assert.equal(r.fatal, false); // only a real boolean true counts
  assert.equal(r.app_version, '3.0.0');
});

test('known sources and platforms are kept, unknown platforms are labelled unknown', () => {
  assert.equal(normalizeErrorReport({ message: 'm', source: 'render' }).source, 'render');
  assert.equal(normalizeErrorReport({ message: 'm', source: 'promise' }).source, 'promise');
  assert.equal(normalizeErrorReport({ message: 'm', platform: 'ios' }).platform, 'ios');
  assert.equal(normalizeErrorReport({ message: 'm', platform: 'windows-phone' }).platform, 'unknown');
  assert.equal(normalizeErrorReport({ message: 'm', fatal: true }).fatal, true);
});

test('control characters are removed but newlines are kept', () => {
  assert.equal(clip('a\u0000b\u0007c\nd', 50), 'abc\nd');
});

test('the same error groups together and different errors do not', () => {
  const a = normalizeErrorReport({ message: 'Cannot read x', stack: 'TypeError\n at one' });
  const b = normalizeErrorReport({ message: 'Cannot read x', stack: 'TypeError\n at two' });
  const c = normalizeErrorReport({ message: 'Different', stack: 'TypeError\n at one' });
  assert.equal(errorFingerprint(a), errorFingerprint(b)); // only the first stack line is used
  assert.notEqual(errorFingerprint(a), errorFingerprint(c));
  assert.match(errorFingerprint(a), /^[0-9a-f]{16}$/);
});
