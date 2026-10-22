import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getJournalPost, JOURNAL_POSTS } from "../data/journalPosts";
import { useSeo } from "../utils/useSeo";

export default function JournalPost() {
  const { slug } = useParams();
  const nav = useNavigate();
  const post = getJournalPost(slug);

  useSeo({
    title: post ? `${post.title} — THE OFF GRID Journal` : "Journal — THE OFF GRID",
    description: post?.excerpt,
    canonical: post ? `/journal/${post.slug}` : "/journal",
    image: post?.image,
  });

  if (!post) {
    return (
      <div className="lookbook-page">
        <header className="simple-header">
          <Link to="/journal"><ArrowLeft /> JOURNAL</Link>
        </header>
        <section className="lookbook-hero">
          <h1>POST NOT<br /><em>FOUND.</em></h1>
          <button className="orange-btn" onClick={() => nav("/journal")}>BACK TO JOURNAL</button>
        </section>
      </div>
    );
  }

  const others = JOURNAL_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="lookbook-page">
      <header className="simple-header">
        <Link to="/journal"><ArrowLeft /> JOURNAL</Link>
      </header>

      <div className="journal-post-hero"><img src={post.image} alt={post.title} /></div>

      <article className="journal-post-body">
        <span>{new Date(post.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
        <h1>{post.title}</h1>
        {post.body.map((para, i) => <p key={i}>{para}</p>)}
      </article>

      {others.length > 0 && (
        <section className="journal-list journal-more">
          <h2>MORE FROM THE JOURNAL</h2>
          {others.map((p) => (
            <button type="button" key={p.slug} className="journal-list-item" onClick={() => nav(`/journal/${p.slug}`)}>
              <div className="journal-list-image"><img src={p.image} alt={p.title} /></div>
              <div className="journal-list-copy">
                <h2>{p.title}</h2>
                <p>{p.excerpt}</p>
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
