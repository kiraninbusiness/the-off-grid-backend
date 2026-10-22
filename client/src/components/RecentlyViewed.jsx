import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productUrl } from "../utils/productUrl";
const money = n => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const KEY = "offgrid_recently_viewed";

// Call this from a product page to record a view (keeps the last 8, newest first).
export function trackRecentlyViewed(id) {
 try {
  const list = JSON.parse(localStorage.getItem(KEY) || "[]").filter(x => String(x) !== String(id));
  list.unshift(id);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)));
 } catch {}
}

export default function RecentlyViewed({ current, products = [] }) {
 const [ids, setIds] = useState([]);
 useEffect(() => {
  try { setIds(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { setIds([]); }
 }, [current?.id]);

 const items = ids
  .filter(id => String(id) !== String(current?.id))
  .map(id => products.find(p => String(p.id) === String(id)))
  .filter(Boolean)
  .slice(0, 4);

 if (!items.length) return null;
 return <section className="recently-viewed">
  <div className="related-products-head"><span>THE OFF GRID / HISTORY</span><h2>RECENTLY <em>VIEWED.</em></h2></div>
  <div className="related-products-grid">
   {items.map(p => <Link className="related-card" to={productUrl(p)} key={p.id}>
    <div className="related-card-image"><img src={p.image} alt={p.name} /></div>
    <div className="related-card-info"><h4>{p.name}</h4><div className="related-card-price"><strong>{money(p.price)}</strong>{p.old_price && <del>{money(p.old_price)}</del>}</div></div>
   </Link>)}
  </div>
 </section>;
}
