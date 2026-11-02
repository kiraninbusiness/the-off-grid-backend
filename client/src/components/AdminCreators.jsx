import React, { useEffect, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { api } from "../api";

export default function AdminCreators() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("pending");
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await api(`/admin/creators${status ? `?status=${status}` : ""}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message || "Could not load creator applications."); }
  };
  useEffect(() => { load(); }, [status]);

  const moderate = async (row, nextStatus) => {
    setBusyId(row.id); setError("");
    try {
      await api(`/admin/creators/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, admin_note: notes[row.id] ?? row.admin_note ?? "" })
      });
      await load();
    } catch (e) { setError(e.message || "Could not update creator application."); }
    finally { setBusyId(null); }
  };

  return (
    <section className="admin-content">
      <div className="admin-panel-header">
        <div><p className="eyebrow">OFF GRID CREATOR PROGRAMME</p><h2><Users size={19} /> Creator Applications</h2></div>
        <button type="button" className="admin-refresh" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>
      <div className="admin-product-actions">
        <select aria-label="Filter creator applications" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paused">Paused</option><option value="">All</option>
        </select>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {!rows.length && <div className="admin-empty"><p>No creator applications in this filter.</p></div>}
      <div className="admin-product-list">
        {rows.map((r) => (
          <article className="admin-product-card" key={r.id}>
            <div className="admin-product-details">
              <div className="admin-product-title"><strong>{r.user_name || "Creator"} · {r.platform}</strong><span className="order-status">{r.status.toUpperCase()}</span></div>
              <p className="muted">{r.user_email} · {Number(r.follower_count || 0).toLocaleString("en-IN")} followers</p>
              <p><b>Handle:</b> {r.handle}{r.secondary_handle ? ` · ${r.secondary_handle}` : ""}</p>
              <p><b>Audience:</b> {r.audience}</p><p>{r.bio}</p>
              <textarea rows={2} maxLength={500} placeholder="Internal admin note" value={notes[r.id] ?? r.admin_note ?? ""} onChange={(e) => setNotes((cur) => ({ ...cur, [r.id]: e.target.value }))} />
              <div className="admin-product-actions">
                {r.status !== "approved" && <button type="button" disabled={busyId === r.id} onClick={() => moderate(r, "approved")}>Approve</button>}
                {r.status !== "rejected" && <button type="button" disabled={busyId === r.id} onClick={() => moderate(r, "rejected")}>Reject</button>}
                {r.status !== "paused" && <button type="button" disabled={busyId === r.id} onClick={() => moderate(r, "paused")}>Pause</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="muted">This screen manages applications only. Commission rates, attribution and payouts are not enabled.</p>
    </section>
  );
}
