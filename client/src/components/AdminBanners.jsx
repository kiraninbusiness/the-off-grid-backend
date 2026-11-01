import React, { useEffect, useState } from "react";
import { api, apiUpload } from "../api";

const blank = { image: "", kicker: "", title: "", copy: "", cta: "SHOP NOW", link: "/(tabs)/shop", sort_order: 0 };

// Admin: banners shown in the mobile app's Home carousel.
export default function AdminBanners() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api("/banners/all").then((r) => setRows(Array.isArray(r) ? r : [])).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg("");
    try {
      const { url } = await apiUpload(file);
      setForm((f) => ({ ...f, image: url }));
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      await api("/banners", { method: "POST", body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) || 0 }) });
      setForm(blank);
      await load();
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }

  async function patch(b, body) {
    try { await api(`/banners/${b.id}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); } catch (err) { setMsg(err.message); }
  }
  async function remove(b) {
    if (!window.confirm("Delete this banner?")) return;
    try { await api(`/banners/${b.id}`, { method: "DELETE" }); await load(); } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="admin-analytics">
      <h3>HOME BANNERS (MOBILE APP)</h3>
      <p className="muted">Shown first in the app's Home carousel, up to 6, lowest order number first. Portrait images about 1080×1400 look best.</p>
      <form onSubmit={create} style={{ display: "grid", gap: 8, maxWidth: 520, margin: "16px 0" }}>
        <input type="file" accept="image/*" onChange={pickImage} />
        {form.image && <img src={form.image} alt="" style={{ maxWidth: 160 }} />}
        <input placeholder="Small label (e.g. FESTIVE SALE)" value={form.kicker} onChange={set("kicker")} />
        <input placeholder="Headline (e.g. UP TO 50% OFF)" value={form.title} onChange={set("title")} />
        <input placeholder="Sub-line (optional)" value={form.copy} onChange={set("copy")} />
        <input placeholder="Button text" value={form.cta} onChange={set("cta")} />
        <input placeholder="Opens (e.g. /deals, /product/12, /(tabs)/shop)" value={form.link} onChange={set("link")} />
        <input type="number" placeholder="Order (0 = first)" value={form.sort_order} onChange={set("sort_order")} />
        <button type="submit" disabled={busy || !form.image}>{busy ? "Working…" : "Add banner"}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {rows.map((b) => (
        <div key={b.id} className="admin-analytics-row" style={{ alignItems: "center", gap: 12 }}>
          <img src={b.image} alt="" style={{ width: 54, height: 70, objectFit: "cover" }} />
          <span style={{ flex: 1 }}>
            <strong>{b.title || "(no headline)"}</strong><br />
            <small>{b.kicker} → {b.link} · order {b.sort_order} · {b.active ? "live" : "hidden"}</small>
          </span>
          <button type="button" onClick={() => patch(b, { active: !b.active })}>{b.active ? "Hide" : "Show"}</button>
          <button type="button" onClick={() => remove(b)}>Delete</button>
        </div>
      ))}
      {!rows.length && <p className="muted">No banners yet. The app falls back to its newest products.</p>}
    </div>
  );
}
