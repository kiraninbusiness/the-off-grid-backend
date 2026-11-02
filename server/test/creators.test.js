import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCreatorApplication } from '../src/services/creators.js';

const valid = {
  platform: 'Instagram', handle: '@offgrid.creator', secondary_handle: '',
  follower_count: 12000, audience: 'Streetwear fans aged 18 to 30',
  bio: 'I create outfit styling videos and streetwear reviews for my community.'
};

test('creator application normalizes public profile data', () => {
  const result = normalizeCreatorApplication(valid);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    platform: 'instagram', handle: 'offgrid.creator', secondary_handle: null,
    follower_count: 12000, audience: 'Streetwear fans aged 18 to 30',
    bio: valid.bio
  });
});

test('creator application rejects unsupported platforms and unsafe handles', () => {
  assert.match(normalizeCreatorApplication({ ...valid, platform: 'facebook' }).error, /Choose Instagram/);
  assert.match(normalizeCreatorApplication({ ...valid, handle: 'https://evil.example' }).error, /valid public profile/);
  assert.match(normalizeCreatorApplication({ ...valid, secondary_handle: 'bad handle' }).error, /secondary profile/);
});

test('creator application validates follower count, audience and bio', () => {
  assert.match(normalizeCreatorApplication({ ...valid, follower_count: -1 }).error, /follower count/);
  assert.match(normalizeCreatorApplication({ ...valid, follower_count: 1.5 }).error, /follower count/);
  assert.match(normalizeCreatorApplication({ ...valid, audience: 'x' }).error, /audience/);
  assert.match(normalizeCreatorApplication({ ...valid, bio: 'short' }).error, /20 characters/);
  assert.equal(normalizeCreatorApplication({ ...valid, handle: '@grid.creator', bio: 'x'.repeat(800) }).value.bio.length, 600);
});
