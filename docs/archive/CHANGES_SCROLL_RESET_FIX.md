# THE OFF GRID — Blank admin page & "scrolled to bottom" product pages, fixed

## Root cause (one bug, two symptoms)
React Router does NOT reset scroll position on navigation by default
— that's a browser-native behavior for full page loads, but single-
page apps have to implement it themselves. Nothing in this codebase
ever did.

That single gap explains both reports:
- **"Admin page showing blank"** — you land on /admin still scrolled
  to wherever you were on the previous page (often a long one, like
  the shop grid). If Admin's actual content doesn't reach that far
  down the page, you're looking at empty space past the end of it —
  not an error, just the wrong scroll position on a shorter page.
- **"Product page opens scrolled to the bottom"** — identical
  mechanism, same missing fix.

## Fix
Added one `useEffect` in `App.jsx` that scrolls to the top on every
route change (`location.pathname`). This is standard practice for any
React Router SPA — every navigation now behaves like a normal page
load.

## Also added: a real error boundary
While diagnosing this, I confirmed there was no error boundary
anywhere in the app — meaning any *actual* uncaught JS error (not this
bug, but a real future one) would silently blank the entire page with
zero indication anything went wrong, on any route, not just Admin.
Added `ErrorBoundary.jsx`, wrapping the whole app in `main.jsx`. If
something does go genuinely wrong in the future, the person sees a
real "something went wrong, reload" message instead of a dead white
screen — and the actual error gets logged to the console for
debugging instead of disappearing.

## Verified before packaging
- `npm run build` (sitemap + vite build) — clean
- All server files pass `node --check` (untouched this round — this
  was a pure frontend bug, confirmed no backend involvement)
