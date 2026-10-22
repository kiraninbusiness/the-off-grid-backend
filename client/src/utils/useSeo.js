import { useEffect } from "react";

/*
  Minimal, dependency-free SEO tag manager — sets document.title,
  meta description, canonical URL, Open Graph tags, and JSON-LD
  structured data for the current page. Restores the previous
  <title> on unmount so navigating away doesn't leave stale tags for
  whatever renders next (React Router here has no shared <head>
  manager, so this does by hand what react-helmet would otherwise do
  — not worth adding a dependency for one page's worth of tags).
*/
export function useSeo({ title, description, canonical, image, jsonLd }) {
  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = title;

    const setMeta = (attr, key, value) => {
      if (!value) return null;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
      return created ? el : null;
    };

    const createdTags = [
      setMeta("name", "description", description),
      setMeta("property", "og:title", title),
      setMeta("property", "og:description", description),
      setMeta("property", "og:image", image),
      setMeta("property", "og:type", "product"),
    ].filter(Boolean);

    let canonicalEl = null;
    let canonicalCreated = false;
    if (canonical) {
      canonicalEl = document.querySelector('link[rel="canonical"]');
      if (!canonicalEl) {
        canonicalEl = document.createElement("link");
        canonicalEl.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalEl);
        canonicalCreated = true;
      }
      canonicalEl.setAttribute("href", canonical);
    }

    let scriptEl = null;
    if (jsonLd) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.text = JSON.stringify(jsonLd);
      document.head.appendChild(scriptEl);
    }

    return () => {
      document.title = previousTitle;
      createdTags.forEach((el) => el.remove());
      if (canonicalCreated && canonicalEl) canonicalEl.remove();
      if (scriptEl) scriptEl.remove();
    };
  }, [title, description, canonical, image, jsonLd]);
}
