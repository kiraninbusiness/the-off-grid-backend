# Fixed: Render deploy crashing on startup

## The error
```
error: duplicate key value violates unique constraint
"cart_items_user_id_product_id_selected_size_selected_color_key"
  at async initDb (.../server/src/db.js:412:3)
code: '23505'
```

## Root cause
The cart duplicate-row migration (from the earlier NULL-vs-NULL fix)
runs this on every server startup:
```sql
UPDATE cart_items SET selected_size = COALESCE(selected_size, ''),
                       selected_color = COALESCE(selected_color, '')
```
That's meant to normalize legacy `NULL` rows to `''` so they can be
correctly deduplicated. But the table's original unique constraint —
`UNIQUE(user_id, product_id, selected_size, selected_color)` — was
still active while this UPDATE ran. If a `NULL` row and an already-`''`
row existed for the same user+product (which can genuinely happen: a
row created before this constraint existed, sitting alongside one
created after), normalizing the `NULL` row to `''` collides with the
existing `''` row under that constraint — and Postgres rejects the
UPDATE outright. Since `initDb()` runs before the server starts
listening, that rejection crashed the entire deploy, every time,
before your app ever came up.

## The fix
Drop the constraint *before* normalizing and deduplicating (so nothing
can collide during cleanup), then recreate it as a plain unique index
*after* the data underneath is already guaranteed duplicate-free by
the existing DELETE step. A unique index is all `ON CONFLICT
(user_id, product_id, selected_size, selected_color)` in `cart.js`
actually needs — it doesn't have to be a named constraint — so nothing
downstream changes behavior.

## Verified before packaging
- Every server file: real ESM syntax check (not the fake-passing
  `node --check <path>` — piped via stdin with `--input-type=module`,
  which actually parses the file).
- Every client file: real JSX compilation via esbuild.
- Full project scan for missing local imports: 0.
- Full project scan for React hooks used without being imported (the
  bug class behind an earlier blank-page crash in this project): 0.

This was the only change in this pass — the security hardening work in
`CHANGES_SECURITY_HARDENING.md` was not modified or re-audited beyond
confirming it still passes the checks above.
