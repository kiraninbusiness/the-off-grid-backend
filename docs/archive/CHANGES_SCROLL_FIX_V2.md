# THE OFF GRID — Scroll fix, hardened

## What changed since the last round
The error boundary from the previous fix IS working correctly — that
"SOMETHING WENT WRONG" screen you're seeing on /admin is it doing its
job (catching a real crash instead of leaving a blank page). But it
means /admin has an actual JS error, not just a scroll issue, and I
need your help pinning it down — see below.

The product-page-opens-scrolled-down issue is a real, separate bug and
I found why the first fix didn't fully solve it: this app has
`scroll-behavior: smooth` set globally, which turns a plain
`scrollTo(0,0)` into an ANIMATED scroll — and that animation can get
interrupted partway if page content is still shifting (images loading
in), landing short of the top. Hardened the fix three ways:
1. Explicit `behavior: "instant"` on the scroll reset, bypassing the
   smooth-scroll CSS entirely for this specific action
2. Disabled the browser's own scroll-restoration-on-navigation
   (`history.scrollRestoration`), which can otherwise fight with
   React Router
3. Disabled CSS scroll-anchoring (`overflow-anchor: none`) — a Chrome
   feature that automatically re-adjusts scroll position to
   "compensate" as content above the viewport changes size, which was
   likely undoing the original fix as your product images loaded in
4. Switched from `useEffect` to `useLayoutEffect` so the reset happens
   before the browser paints the new page, not after

## What I need from you to fix the admin crash properly
I went through every risky data-access pattern in AdminExtras.jsx
(the returns tab, which loads first; the analytics tab; the customer
detail panel) — all of them are already properly guarded against
missing/null data. I can't find this one by reading the code alone.

Two things would let me fix this precisely instead of guessing:
1. **Open the admin page, press F12, click the Console tab, reload —
   screenshot the red error text.** My error boundary already logs
   the full error and stack trace there. This turns "guess which line
   crashed" into "read exactly which line crashed."
2. **Confirm which zip is actually live right now.** I noticed the
   product photos in your last screenshot don't match either version
   I've built recently — worth double-checking you're deploying the
   most recent zip I sent, not an older one, so I'm not fixing bugs
   against different code than what's actually running.

## Verified before packaging
- `npm run build` — clean
