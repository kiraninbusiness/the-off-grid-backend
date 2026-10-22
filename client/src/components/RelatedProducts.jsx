import React from "react";
import { Link } from "react-router-dom";
import { productUrl } from "../utils/productUrl";
const money = n => `₹${Number(n || 0).toLocaleString("en-IN")}`;
export default function RelatedProducts({ current, products = [] }) {
 const related = products
  .filter(p => String(p.id) !== String(current.id) && p.category === current.category)
  .slice(0, 4);
 if (!related.length) return null;
 return <section className="related-products">
  <div className="related-products-head"><span>THE OFF GRID / YOU MAY ALSO LIKE</span><h2>MORE IN <em>{current.category}.</em></h2></div>
  <div className="related-products-grid">
   {related.map(p => <Link className="related-card" to={productUrl(p)} key={p.id}>
    <div className="related-card-image"><img src={p.image} alt={p.name} /></div>
    <div className="related-card-info"><h4>{p.name}</h4><div className="related-card-price"><strong>{money(p.price)}</strong>{p.old_price && <del>{money(p.old_price)}</del>}</div></div>
   </Link>)}
  </div>
 </section>;
}
