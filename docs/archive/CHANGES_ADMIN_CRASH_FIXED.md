# THE OFF GRID — Admin crash: found and fixed

## The actual bug
`Admin.jsx` uses `<X size={15} />` (the close icon) on the dismiss
buttons for its error and success banners — but `X` was never
imported from `lucide-react` in that file. Every other file that uses
the same icon (CartDrawer, ProductCard, SizeGuideModal, App.jsx, etc.)
imports it correctly; this one file didn't.

This is exactly the kind of bug that slips past `vite build` — it's
valid JavaScript syntax, so the build succeeds. It only throws at
**runtime**, and only when that specific code path actually renders —
which is why it looked like it "sometimes" crashed rather than always.

## Why it looked connected to the 401 errors
It was connected, just not how it first appeared. Your console showed
~10 API calls failing with 401 (expired session token) right before
the crash. That's not a coincidence: those failures were setting
Admin's error-banner state, which rendered the dismiss button, which
referenced the undefined `X` — crashing the whole page. Two real bugs,
triggering each other:
1. **Fixed**: added the missing `X` import
2. **Fixed properly this time**: a 401 no longer cascades into a wall
   of failed requests and a crash. `api.js` now catches any 401,
   clears the stale session, and redirects to `/account` with a
   "your session expired — please sign in again" message. This isn't
   just a patch on the crash — it's the actual correct behavior for
   an expired token regardless of the X bug.

## How I found it this time
Your screenshot's console output. Static reading of the code (what I
tried in the last two rounds) could not have found this reliably —
it's a runtime-only error in a minified bundle. I then swept the rest
of the codebase for the same *class* of bug (a JSX tag referencing a
component name that was never imported) and manually verified every
other flagged candidate — all were false positives (locally-defined
components, or a local variable named `Icon` holding an icon
reference, which is a valid, different pattern).

## Verified before packaging
- `npm run build` — clean
- All server files pass `node --check` (untouched — this was entirely
  a frontend bug)
