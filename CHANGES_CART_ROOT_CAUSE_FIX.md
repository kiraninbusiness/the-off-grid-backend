# THE OFF GRID — Root cause fix: cart growing to 1000+ items on its own

## What was actually happening
The merge-on-login effect was watching `user?.id` in a `useEffect`.
That value is truthy not just right after a fresh login, but on
*every single page load* where you already have a saved session —
which is the normal case for a returning logged-in visitor. Since the
merge endpoint is **additive** (adds the incoming cart onto whatever
the server already has, by design — that's correct behavior for
combining a genuinely new guest cart into an account), calling it on
every reload meant every reload added the cart to itself: roughly
doubling every time. 1 → 2 → 4 → 8 → 16 ... about ten reloads and
you're right around 1000. No user action required — exactly what you
saw.

The earlier fix (the ref guard, the NULL-safety fix) addressed a real
but different bug — duplicate rows from repeated Add to Bag clicks.
This is the bug behind the huge number you're seeing now.

## The fix
Split into two operations that were wrongly combined into one:
- **Loading your cart** (GET, replace local state) — now runs on every
  page load, which is correct and safe, because replacing can't ever
  inflate anything no matter how many times it runs.
- **Merging a guest cart into your account** (POST, additive) — now
  only ever runs once, called explicitly from the login/register/
  Google sign-in success handlers in Account.jsx. It no longer lives
  in an effect that fires on ordinary page loads.

## Cleanup for what's already corrupted
- DB migration resets any `cart_items.quantity > 20` back to 1 —
  nobody has genuinely added 1000 of anything, so that number is bug
  fallout, not real intent, and there's no way to recover "what they
  actually meant" from a corrupted total.
- Added a server-side safety cap (`LEAST(..., 20)`) directly in the
  merge query itself, so even if some other bug triggers repeated
  merges in the future, quantity per line can't run away again.

## Verified before packaging
- `vite build` — clean
- All server files pass `node --check`
- Full server import test — every route loads and mounts correctly
