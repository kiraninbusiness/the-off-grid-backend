import React from "react";
import { INFO_PAGES } from "../data/infoPages";

export default function InfoPage({ slug }) {
  const page = INFO_PAGES[slug];

  if (!page) {
    return (
      <div className="page info-page">
        <div className="page-head"><span>THE OFF GRID</span><h1>PAGE NOT <em>FOUND.</em></h1></div>
      </div>
    );
  }

  const words = page.title.split(" ");
  const lastWord = words.pop();

  return (
    <div className="page info-page">
      <div className="page-head">
        <span>{page.eyebrow}</span>
        <h1>{words.join(" ")} <em>{lastWord}</em></h1>
      </div>
      <div className="info-page-body">
        {page.sections.map((s) => (
          <div key={s.heading}>
            <h3>{s.heading}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
