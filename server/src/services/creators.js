export function normalizeCreatorApplication(input = {}) {
  const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/\\s+/g, ' ').slice(0, max) : '';
  const platform = clean(input.platform, 24).toLowerCase();
  const handle = clean(input.handle, 80).replace(/^@/, '');
  const secondary = clean(input.secondary_handle, 80).replace(/^@/, '');
  const audience = clean(input.audience, 80);
  const bio = clean(input.bio, 600);
  const followerCount = Number(input.follower_count);
  if (!['instagram', 'youtube', 'tiktok'].includes(platform)) return { error: 'Choose Instagram, YouTube or TikTok as your main platform' };
  if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return { error: 'Enter a valid public profile handle' };
  if (secondary && !/^[A-Za-z0-9._-]{2,80}$/.test(secondary)) return { error: 'Enter a valid secondary profile handle' };
  if (!Number.isSafeInteger(followerCount) || followerCount < 0 || followerCount > 100000000) return { error: 'Enter a valid follower count' };
  if (audience.length < 2 || bio.length < 20) return { error: 'Tell us about your audience and your content (at least 20 characters)' };
  return { value: { platform, handle, secondary_handle: secondary || null, follower_count: followerCount, audience, bio } };
}
