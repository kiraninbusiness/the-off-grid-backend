import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JOURNAL_POSTS } from "../data/journalPosts";
import { useSeo } from "../utils/useSeo";

export default function Journal() {
  const nav = useNavigate();

  useSeo({
    title: "Journal — THE OFF GRID",
    description: "Stories on style, fabric, and building clothes that don't chase trends.",
    canonical: "/journal",
  });

  return (
    <div className="lookbook-page">
      <header className="simple-header">
        <Link to="/"><ArrowLeft /> THE OFF GRID</Link>
        <span>JOURNAL</span>
      </header>

      <section className="lookbook-hero">
        <span>THE OFF GRID / JOURNAL</span>
        <h1>STORIES,<br /><em>NOT TRENDS.</em></h1>
        <p>Thoughts on fabric, fit, and building a wardrobe that isn't chasing this month's algorithm.</p>
      </section>

      <section className="journal-list">
        {JOURNAL_POSTS.map((post) => (
          <button type="button" key={post.slug} className="journal-list-item" onClick={() => nav(`/journal/${post.slug}`)}>
            <div className="journal-list-image"><img src={post.image} alt={post.title} /></div>
            <div className="journal-list-copy">
              <span>{new Date(post.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
              <span className="journal-read-more">READ MORE <ArrowRight size={14} /></span>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
