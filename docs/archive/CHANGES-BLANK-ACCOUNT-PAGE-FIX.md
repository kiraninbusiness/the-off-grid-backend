# Fixed: blank /account page + washed-out colors

## Blank/black /account page — root cause found
`Account.jsx` called `useRef()` at the top of the component, but the
React import at the top of the file only pulled in `useEffect`,
`useMemo`, and `useState` — `useRef` was never imported. That's a
`ReferenceError` thrown on every single render of that page, which
crashes the whole component tree to a blank screen. This is exactly
the kind of bug that a bundler's syntax check (which is all `esbuild`
verification catches) cannot see — `useRef` is syntactically valid to
write, it just doesn't exist at runtime. Fixed the import.

I also scanned every other `.jsx` file in the project for this same
class of bug (a React hook called but not imported) — nothing else
was affected.

## Washed-out / inverted-looking colors
`index.html` had a `theme-color` meta tag but no `color-scheme` one.
Without declaring that a page manages its own dark theme, some
browsers' "auto dark mode for websites" feature (this is a real,
documented Edge/Chrome feature) can decide to forcibly recolor pages
it doesn't recognize as intentionally dark — which produces exactly
the washed-out, barely-readable text over a mismatched background
described. Added `<meta name="color-scheme" content="dark">` to
`index.html` and `color-scheme: dark` to the `:root` CSS as a
belt-and-suspenders fix (both are the standard ways to declare this,
and browsers respect either).

## Also noticed
The codebase already has real Google Sign-In wiring on `/account`
(`VITE_GOOGLE_CLIENT_ID`), safely no-op when the env var is unset — it
just wasn't documented in `.env.example`. Added.

---
Verified with real syntax checking across the whole project, plus a
new check specifically for hooks used without being imported (the bug
class that caused this). Zero failures.
