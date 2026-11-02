import React, { useEffect, useState } from "react";
import { api } from "../api";

// Admin: approve or reject outfit photos customers share in the app's Community feed.
export default function AdminCommunity() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");

  const load = () => api("/community/admin/all").then((r) => setRows(Array.isArray(r) ? r : [])).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  async function setStatus(p, status) {
    try { await api(`/community/admin/${p.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); } catch (e) { setMsg(e.message); }
  }
  async function remove(p) {
    if (!window.confirm("Delete this photo permanently?")) return;
    try { await api(`/community/admin/${p.id}`, { method: "DELETE" }); await load(); } catch (e) { setMsg(e.message); }
  }

  const waiting = rows.filter((r) => r.status === "pending").length;
  return (
    <div className="admin-analytics">
      <h3>COMMUNITY PHOTOS ({waiting} WAITING)</h3>
      <p className="muted">Outfit photos customers share in the app. Only approved photos are shown to others.</p>
      {msg && <p className="muted">{msg}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {rows.map((p) => (
          <div key={p.id} style={{ width: 160 }}>
            <a href={p.image} target="_blank" rel="noreferrer">
              <img src={p.image} alt="" loading="lazy" style={{ width: 160, height: 200, objectFit: "cover", display: "block" }} />
            </a>
            <small>{p.name} · {p.status === "approved" ? "live" : p.status === "rejected" ? "rejected" : "waiting"}</small>
            {p.caption && <div><small>{p.caption}</small></div>}
            <div className="admin-product-actions">
              {p.status !== "approved" && <button type="button" onClick={() => setStatus(p, "approved")}>Approve</button>}
              {p.status !== "rejected" && <button type="button" onClick={() => setStatus(p, "rejected")}>Reject</button>}
              <button type="button" className="delete" onClick={() => remove(p)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!rows.length && <p className="muted">No photos yet.</p>}
    </div>
  );
}
