import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PRODUCTS from "../data/products.js";
import { productUrl } from "../utils/productUrl";

const EDITORIALS = [
  {
    title: "OFF THE GRID, ON THE STREET",
    tag: "STORY 01",
    copy: "Clean silhouettes built for movement. This is what independence looks like on a Tuesday.",
    image: "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?auto=format&fit=crop&w=1600&q=90",
  },
  {
    title: "LAYERS FOR NO ONE ELSE",
    tag: "STORY 02",
    copy: "Oversized fits and heavyweight fabric. Dressed for yourself, not the algorithm.",
    image: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=1600&q=90",
  },
  {
    title: "NIGHT SHIFT",
    tag: "STORY 03",
    copy: "Muted tones, structured cuts. The uniform for after-hours and everything in between.",
    image: "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?auto=format&fit=crop&w=1600&q=90",
  },
];

export default function Lookbook({ products = PRODUCTS }) {
  const nav = useNavigate();
  const featured = products.slice(0, 6);

  return (
    <div className="lookbook-page">
      <header className="simple-header">
        <Link to="/"><ArrowLeft /> THE OFF GRID</Link>
        <span>LOOKBOOK</span>
      </header>

      <section className="lookbook-hero">
        <span>THE OFF GRID / EDITORIAL</span>
        <h1>NOT MADE<br /><em>FOR EVERYONE.</em></h1>
        <p>A closer look at how the collection comes together — no rules, just style.</p>
      </section>

      {EDITORIALS.map((story, i) => (
        <section className={`lookbook-story ${i % 2 ? "reverse" : ""}`} key={story.title}>
          <div className="lookbook-story-image"><img src={story.image} alt={story.title} /></div>
          <div className="lookbook-story-copy">
            <span>{story.tag}</span>
            <h2>{story.title}</h2>
            <p>{story.copy}</p>
            <button className="under-btn" onClick={() => nav("/")}>SHOP THE LOOK <ArrowRight size={15} /></button>
          </div>
        </section>
      ))}

      <section className="lookbook-grid-section">
        <h2>FEATURED IN THIS DROP</h2>
        <div className="lookbook-product-grid">
          {featured.map((p) => (
            <button type="button" key={p.id} onClick={() => nav(productUrl(p))} className="lookbook-product-card">
              <img src={p.image} alt={p.name} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
