import React from "react";
import { Link } from "react-router-dom";
import { productUrl } from "../utils/productUrl";
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function CompleteTheLook({ current, products = [], selectedSize = "" }) {
  const matches = products
    .filter((p) => String(p.id) !== String(current?.id))
    .filter((p) => {
      const cat = String(p.category || "").toUpperCase();
      const currentCat = String(current?.category || "").toUpperCase();
      if (currentCat === "T-SHIRTS" || currentCat === "TANK TOPS") return ["BOTTOMS", "ACCESSORIES", "JACKETS"].includes(cat);
      if (currentCat === "BOTTOMS") return ["T-SHIRTS", "TANK TOPS", "SHIRTS", "ACCESSORIES"].includes(cat);
      if (currentCat === "SHIRTS" || currentCat === "JACKETS") return ["BOTTOMS", "T-SHIRTS", "ACCESSORIES"].includes(cat);
      return ["T-SHIRTS", "BOTTOMS", "ACCESSORIES"].includes(cat);
    })
    .slice(0, 2);

  if (!matches.length) return null;
  const look = [current, ...matches];
  const total = look.reduce((sum, p) => sum + Number(p.price || 0), 0);

  return <section className="complete-look">
    <div className="complete-look-copy">
      <span>THE OFF GRID / STYLE EDIT</span>
      <h2>COMPLETE<br/><em>THE LOOK.</em></h2>
      <p>Built to work together. Pair this piece with two OFF GRID essentials for a complete everyday uniform.</p>
      <strong>{money(total)}</strong><small>for the full look</small>
      <button className="complete-look-button" disabled={String(current?.size || "").includes("/") && !selectedSize} onClick={() => window.dispatchEvent(new CustomEvent("offgrid-add-look", { detail: look.map((p) => p.id === current.id ? { ...p, selectedSize: selectedSize || null } : p) }))}>{String(current?.size || "").includes("/") && !selectedSize ? "SELECT SIZE ABOVE" : "ADD FULL LOOK"}</button>
    </div>
    <div className="complete-look-grid">
      {look.map((p, i) => <Link key={p.id} to={productUrl(p)} className="complete-look-card">
        <div className="complete-look-image"><img src={p.image} alt={p.name} loading="lazy" /><span>0{i + 1}</span></div>
        <h4>{p.name}</h4><p>{money(p.price)}</p>
      </Link>)}
    </div>
  </section>;
}
