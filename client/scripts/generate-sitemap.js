// Generates client/public/sitemap.xml before `vite build` runs (see
// the "prebuild" script in package.json), so the sitemap always
// reflects whatever's actually deployed rather than going stale.
//
// Static marketing pages are always included. Product pages are
// fetched live from the API at build time — if that fails (API not
// reachable during a local build, env var not set, etc.) the build
// still succeeds with just the static pages rather than crashing;
// worth checking SITE_URL and VITE_API_URL are set correctly on
// Vercel if product URLs seem to be missing from a real deploy.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_URL = process.env.SITE_URL || 'https://theoffgrid.in';
const API_URL = process.env.VITE_API_URL || 'http://localhost:5000/api';

const STATIC_PATHS = [
  { path: '/', priority: '1.0' },
  { path: '/lookbook', priority: '0.6' },
  { path: '/journal', priority: '0.6' },
  { path: '/gift-cards', priority: '0.5' },
  { path: '/faq', priority: '0.4' },
  { path: '/contact', priority: '0.4' },
  { path: '/shipping-policy', priority: '0.3' },
  { path: '/returns-policy', priority: '0.3' },
  { path: '/cancellation-policy', priority: '0.3' },
  { path: '/privacy-policy', priority: '0.3' },
  { path: '/cookie-policy', priority: '0.3' },
  { path: '/terms-of-service', priority: '0.3' },
];

async function getJournalPaths() {
  try {
    const mod = await import('../src/data/journalPosts.js');
    return mod.JOURNAL_POSTS.map((p) => ({ path: `/journal/${p.slug}`, priority: '0.5' }));
  } catch {
    return [];
  }
}

async function getProductPaths() {
  try {
    const res = await fetch(`${API_URL}/products`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const products = await res.json();
    if (!Array.isArray(products)) return [];
    return products.map((p) => ({
      path: p.slug ? `/product/${p.id}/${p.slug}` : `/product/${p.id}`,
      priority: '0.8',
    }));
  } catch (e) {
    console.warn(`[sitemap] Could not fetch products from ${API_URL} — sitemap will only include static pages. (${e.message})`);
    return [];
  }
}

async function generate() {
  const journalPaths = await getJournalPaths();
  const productPaths = await getProductPaths();
  const all = [...STATIC_PATHS, ...journalPaths, ...productPaths];

  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  const outPath = path.join(__dirname, '../public/sitemap.xml');
  fs.writeFileSync(outPath, xml);
  console.log(`[sitemap] Wrote ${all.length} URLs to ${outPath} (${productPaths.length} products, ${journalPaths.length} journal posts, ${STATIC_PATHS.length} static pages)`);
}

generate();
