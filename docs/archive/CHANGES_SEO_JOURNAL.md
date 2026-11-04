# THE OFF GRID — Sitemap, robots.txt, and a real Journal

## robots.txt
`client/public/robots.txt` — allows crawling, blocks account/admin/
checkout/order pages, points to the sitemap. **Update the domain in
this file and in `SITE_URL` (see below) if theoffgrid.in isn't your
actual domain** — I used it as the placeholder since that's the name
throughout the app, but confirm before this goes live.

## sitemap.xml — generated at build time, not static
Rather than a static file that goes stale, `client/scripts/
generate-sitemap.js` runs automatically before every `vite build`
(wired in as an npm "prebuild" step) and:
- Always includes every static marketing/legal page
- Always includes all journal posts
- Fetches your live product catalog from the API and includes every
  product URL (with its SEO slug when it has one)
- **Gracefully degrades** if the API isn't reachable at build time —
  logs a warning and ships the sitemap with just static + journal
  pages rather than failing the whole build. Verified this actually
  works (tested with no API running).

Set `SITE_URL` in your Vercel build environment if your real domain
differs from theoffgrid.in — defaults to that if unset. Also uses the
same `VITE_API_URL` your app already reads for API calls.

## Journal — was decorative, now real
The homepage "READ THE JOURNAL" button and the mobile menu's JOURNAL
link went to a scroll-anchor teaser section with no actual content
behind it. Now:
- `/journal` — a real listing page
- `/journal/:slug` — individual posts, each with its own SEO tags
  (title/description/OG image) via the existing `useSeo` hook
- Three real posts written to match your brand voice (state-of-mind,
  wear-your-way, made-for-the-exceptions), stored as static content in
  `client/src/data/journalPosts.js` — same pattern as how Lookbook's
  editorial content already works, so adding a fourth post later is
  just adding an object to that array
- Footer now links to Journal alongside Lookbook

## Verified before packaging
- `npm run build` (prebuild + vite build) — clean, confirmed sitemap.xml
  and robots.txt both land in `dist/`
- All server files pass `node --check` (untouched this round, just
  confirming no regression)
