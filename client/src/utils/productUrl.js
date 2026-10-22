// Builds a product URL that includes the SEO slug when the product has
// one, while staying fully backward compatible: /product/:id alone
// still resolves correctly (see products.js's GET /:id and App.jsx's
// route parsing, which only ever reads the id segment).
export function productUrl(p) {
  if (!p) return "/product";
  return p.slug ? `/product/${p.id}/${p.slug}` : `/product/${p.id}`;
}
