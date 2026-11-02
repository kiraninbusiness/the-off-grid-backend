// Product recommendations: "similar to this" and "picked for you". Pure scoring, no database access.

const norm = (v) => String(v ?? '').trim().toLowerCase();

/** How alike two products are. Higher is more similar. */
export function similarity(base, c) {
  let score = 0;
  if (norm(base.category) && norm(base.category) === norm(c.category)) score += 4;
  const bg = norm(base.gender), cg = norm(c.gender);
  if (bg && bg === cg) score += 2;
  else if (cg === 'unisex' || bg === 'unisex') score += 1;
  if (norm(base.color) && norm(base.color) === norm(c.color)) score += 1.5;
  if (norm(base.fit) && norm(base.fit) === norm(c.fit)) score += 1;
  if (norm(base.material) && norm(base.material) === norm(c.material)) score += 1;
  const bp = Number(base.price), cp = Number(c.price);
  if (bp > 0 && cp > 0) {
    const gap = Math.abs(bp - cp) / bp;
    if (gap <= 0.15) score += 2;
    else if (gap <= 0.35) score += 1;
  }
  return score;
}

/** Taste profile from what the customer wishlisted (weight 2) or bought (weight 3). */
export function buildProfile(wishlisted = [], purchased = []) {
  const profile = { category: {}, gender: {}, color: {}, fit: {}, priceSum: 0, priceWeight: 0 };
  const add = (p, w) => {
    for (const k of ['category', 'gender', 'color', 'fit']) {
      const v = norm(p[k]);
      if (v) profile[k][v] = (profile[k][v] || 0) + w;
    }
    if (Number(p.price) > 0) { profile.priceSum += Number(p.price) * w; profile.priceWeight += w; }
  };
  wishlisted.forEach((p) => add(p, 2));
  purchased.forEach((p) => add(p, 3));
  profile.empty = profile.priceWeight === 0;
  profile.avgPrice = profile.empty ? 0 : profile.priceSum / profile.priceWeight;
  return profile;
}

export function profileScore(profile, c, now = new Date()) {
  let score = 0;
  const share = (map, v) => {
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return (map[norm(v)] || 0) / total;
  };
  score += share(profile.category, c.category) * 6;
  score += share(profile.gender, c.gender) * 2;
  score += share(profile.color, c.color) * 1.5;
  score += share(profile.fit, c.fit) * 1;
  if (profile.avgPrice > 0 && Number(c.price) > 0) {
    const gap = Math.abs(Number(c.price) - profile.avgPrice) / profile.avgPrice;
    if (gap <= 0.25) score += 1.5;
    else if (gap <= 0.5) score += 0.5;
  }
  const ageDays = (now - new Date(c.created_at)) / 86400000;
  if (Number.isFinite(ageDays) && ageDays >= 0 && ageDays < 21) score += 1; // fresh drops get a small lift
  return score;
}

/** Picks the top n, never more than maxPerCategory from one category, in-stock only. */
export function rank(candidates, scoreFn, { n = 8, exclude = new Set(), maxPerCategory = 3 } = {}) {
  const scored = candidates
    .filter((c) => Number(c.stock) > 0 && !exclude.has(Number(c.id)))
    .map((c) => ({ c, s: scoreFn(c) }))
    .sort((a, b) => b.s - a.s || new Date(b.c.created_at) - new Date(a.c.created_at));
  const perCat = {};
  const out = [];
  for (const { c } of scored) {
    const k = norm(c.category);
    if ((perCat[k] || 0) >= maxPerCategory) continue;
    perCat[k] = (perCat[k] || 0) + 1;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}
