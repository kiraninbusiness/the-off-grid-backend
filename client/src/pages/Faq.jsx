import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FAQ_ITEMS } from "../data/infoPages";

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="page info-page">
      <div className="page-head">
        <span>THE OFF GRID / FAQ</span>
        <h1>COMMON <em>QUESTIONS.</em></h1>
      </div>
      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div className={`faq-item ${open === i ? "open" : ""}`} key={item.q}>
            <button type="button" onClick={() => setOpen(open === i ? -1 : i)}>
              <span>{item.q}</span>
              <ChevronDown size={18} />
            </button>
            {open === i && <p>{item.a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
