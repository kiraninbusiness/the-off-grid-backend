import React, { useEffect, useState } from "react";
import { api, apiUpload } from "../api";

const blank = { min_tier: "", title: "", image: "", description: "", creator: "", sort_order: 0, product_ids: [] };

// Admin: curated outfits ("looks") shown in the app's Style tab.
export default function AdminLooks() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api("/looks/all").then((r) => setRows(Array.isArray(r) ? r : [])).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    api("/products").then((r) => setProducts(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (id) =>
    setForm((f) => ({ ...f, product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id] }));

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
      await api("/looks", { method: "POST", body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) || 0 }) });
      setForm(blank);
      await load();
    } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }

  async function toggleActive(l) {
    try { await api(`/looks/${l.id}`, { method: "PATCH", body: JSON.stringify({ active: !l.active }) }); await load(); } catch (err) { setMsg(err.message); }
  }
  async function remove(l) {
    if (!window.confirm("Delete this look?")) return;
    try { await api(`/looks/${l.id}`, { method: "DELETE" }); await load(); } catch (err) { setMsg(err.message); }
  }

  const shown = products.filter((p) => !search || String(p.name).toLowerCase().includes(search.toLowerCase())).slice(0, 40);

  return (
    <div className="admin-analytics">
      <h3>LOOKS (STYLE TAB IN THE APP)</h3>
      <p className="muted">Build a complete outfit from 2 to 8 products. Add a creator or stylist name to credit the person who put it together.</p>
      <form onSubmit={create} style={{ display: "grid", gap: 8, maxWidth: 560, margin: "16px 0" }}>
        <input type="file" accept="image/*" onChange={pickImage} />
        {form.image && <img src={form.image} alt="" style={{ maxWidth: 160 }} />}
        <input placeholder="Look name (e.g. Weekend Street)" value={form.title} onChange={set("title")} />
        <input placeholder="Short description (optional)" value={form.description} onChange={set("description")} />
        <input placeholder="Creator or stylist (optional)" value={form.creator} onChange={set("creator")} />
        <select value={form.min_tier} onChange={set("min_tier")}>
          <option value="">Open to everyone</option>
          <option value="silver">Silver members and above</option>
          <option value="gold">Gold members and above</option>
          <option value="black">Black members only</option>
        </select>
        <input type="number" placeholder="Order (0 = first)" value={form.sort_order} onChange={set("sort_order")} />
        <input placeholder="Search products to add" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", padding: 8 }}>
          {shown.map((p) => (
            <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
              <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
        <small>{form.product_ids.length} selected</small>
        <button type="submit" disabled={busy || !form.image}>{busy ? "Working…" : "Add look"}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {rows.map((l) => (
        <div key={l.id} className="admin-analytics-row" style={{ alignItems: "center", gap: 12 }}>
          <img src={l.image} alt="" style={{ width: 54, height: 70, objectFit: "cover" }} />
          <span style={{ flex: 1 }}>
            <strong>{l.title}</strong><br />
            <small>{l.products.length} products{l.creator ? ` · by ${l.creator}` : ""} · {l.active ? "live" : "hidden"}{l.min_tier ? ` · ${l.min_tier} members` : ""}</small>
          </span>
          <button type="button" onClick={() => toggleActive(l)}>{l.active ? "Hide" : "Show"}</button>
          <button type="button" onClick={() => remove(l)}>Delete</button>
        </div>
      ))}
      {!rows.length && <p className="muted">No looks yet.</p>}
    </div>
  );
}
