import React, { useEffect, useState } from "react";
import { RefreshCw, Trash2, EyeOff, Eye, Users, MessageSquareWarning, PackageSearch, Undo2, Gift, Layers, Mail, Boxes, Plus, TrendingUp } from "lucide-react";
import { api } from "../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const RETURN_STATUSES = ["requested", "approved", "rejected", "received", "refunded", "exchanged"];

function VariantEditor({ product, onClose, onSaved }) {
  const baseSizes = String(product.size || "").split("/").map((s) => s.trim()).filter(Boolean);
  const baseColors = (product.color ? [product.color] : [""]);
  const [rows, setRows] = useState(() => {
    if (Array.isArray(product.variants) && product.variants.length) return product.variants.map((v) => ({ ...v }));
    return baseSizes.flatMap((size) => baseColors.map((color) => ({ size, color, stock: 0, sku: "", barcode: "", cost_price: "" })));
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const updateRow = (i, field, value) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((cur) => [...cur, { size: "", color: "", stock: 0, sku: "", barcode: "", cost_price: "" }]);
  const removeRow = (i) => setRows((cur) => cur.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/products/${product.id}/variants`, {
        method: "PUT",
        body: JSON.stringify({
          variants: rows.filter((r) => r.size).map((r) => ({
            size: r.size, color: r.color || "", stock: Number(r.stock) || 0,
            sku: r.sku || "", barcode: r.barcode || "",
            cost_price: r.cost_price === "" || r.cost_price == null ? null : Number(r.cost_price),
          })),
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || "Could not save variants.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-variant-editor">
      <h4>SIZE / COLOR STOCK — {product.name}</h4>
      <div className="admin-variant-rows">
        <div className="admin-variant-row admin-variant-header">
          <span>Size</span><span>Color</span><span>Stock</span><span>SKU</span><span>Barcode</span><span>Cost ₹</span><span />
        </div>
        {rows.map((r, i) => (
          <div className="admin-variant-row" key={i}>
            <input placeholder="SIZE" value={r.size} onChange={(e) => updateRow(i, "size", e.target.value)} />
            <input placeholder="COLOR" value={r.color || ""} onChange={(e) => updateRow(i, "color", e.target.value)} />
            <input type="number" min="0" placeholder="STOCK" value={r.stock} onChange={(e) => updateRow(i, "stock", e.target.value)} />
            <input placeholder="OG-TEE-BLK-M" value={r.sku || ""} onChange={(e) => updateRow(i, "sku", e.target.value)} />
            <input placeholder="890XXXXXXXX" value={r.barcode || ""} onChange={(e) => updateRow(i, "barcode", e.target.value)} />
            <input type="number" min="0" placeholder="650" value={r.cost_price ?? ""} onChange={(e) => updateRow(i, "cost_price", e.target.value)} />
            <button type="button" className="delete" onClick={() => removeRow(i)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="text-button" onClick={addRow}><Plus size={14} /> ADD ROW</button>
      {err && <p className="notify-me-error">{err}</p>}
      <div className="admin-variant-actions">
        <button type="button" className="orange-btn" disabled={busy} onClick={save}>{busy ? "SAVING..." : "SAVE VARIANTS"}</button>
        <button type="button" className="text-button" onClick={onClose}>CANCEL</button>
      </div>
    </div>
  );
}

function StockLedger({ productId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/products/${productId}/stock-movements`)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) return <p className="muted">Loading history...</p>;
  if (!rows.length) return <p className="muted">No inventory movement recorded yet.</p>;

  return (
    <div className="admin-stock-ledger">
      {rows.map((r) => (
        <div key={r.id} className="admin-stock-ledger-row">
          <span>{new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
          <span className={r.change >= 0 ? "positive" : "negative"}>{r.change >= 0 ? `+${r.change}` : r.change}</span>
          <span>{r.size ? `${r.size}${r.color ? " / " + r.color : ""}${r.sku ? ` (${r.sku})` : ""}` : "—"}</span>
          <span className="muted">{r.reason.replace(/_/g, " ")}{r.reference ? ` · ${r.reference}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminExtras({ user }) {
  const [tab, setTab] = useState("returns");
  const [returns, setReturns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [editingVariantsFor, setEditingVariantsFor] = useState(null);
  const [ledgerFor, setLedgerFor] = useState(null);
  const [contactMessages, setContactMessages] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [giftCards, setGiftCards] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboForm, setComboForm] = useState({ title: "", category: "", quantity: "", bundle_price: "" });
  const [comboBusy, setComboBusy] = useState(false);
  const [abandonedPreview, setAbandonedPreview] = useState([]);
  const [abandonedBusy, setAbandonedBusy] = useState(false);
  const [abandonedResult, setAbandonedResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);

  const load = async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setErr("");
    try {
      const [r, c, rv, sa, ip, gc, cb, cm, an] = await Promise.all([
        api("/returns"),
        api("/admin/customers"),
        api("/admin/reviews"),
        api("/admin/stock-alerts"),
        api("/products"),
        api("/gift-cards"),
        api("/combos/all"),
        api("/contact"),
        api("/admin/analytics"),
      ]);
      setReturns(Array.isArray(r) ? r : []);
      setCustomers(Array.isArray(c) ? c : []);
      setReviews(Array.isArray(rv) ? rv : []);
      setStockAlerts(Array.isArray(sa) ? sa : []);
      setInventoryProducts(Array.isArray(ip) ? ip : []);
      setGiftCards(Array.isArray(gc) ? gc : []);
      setCombos(Array.isArray(cb) ? cb : []);
      setContactMessages(Array.isArray(cm) ? cm : []);
      setAnalytics(an || null);
    } catch (e) {
      setErr(e.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const updateReturn = async (id, patch) => {
    try {
      const updated = await api(`/returns/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setReturns((cur) => cur.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setErr(e.message || "Could not update request.");
    }
  };

  const updateShipment = async (id, patch) => {
    try {
      const updated = await api(`/returns/${id}/shipment`, { method: "PATCH", body: JSON.stringify(patch) });
      setReturns((cur) => cur.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setErr(e.message || "Could not update shipment.");
    }
  };

  const [refundingId, setRefundingId] = useState(null);
  const issueRefund = async (ret, amount) => {
    setRefundingId(ret.id);
    setErr("");
    try {
      const updated = await api(`/returns/${ret.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ refund_amount: amount ? Number(amount) : undefined }),
      });
      setReturns((cur) => cur.map((r) => (r.id === ret.id ? { ...r, ...updated } : r)));
    } catch (e) {
      setErr(e.message || "Could not issue refund.");
    } finally {
      setRefundingId(null);
    }
  };

  const [resendingId, setResendingId] = useState(null);
  const resendGiftCard = async (card) => {
    setResendingId(card.id);
    setErr("");
    try {
      const updated = await api(`/gift-cards/${card.id}/resend`, { method: "POST" });
      setGiftCards((cur) => cur.map((g) => (g.id === card.id ? updated : g)));
    } catch (e) {
      setErr(e.message || "Could not resend gift card.");
    } finally {
      setResendingId(null);
    }
  };

  const toggleReviewHidden = async (review) => {
    try {
      const updated = await api(`/admin/reviews/${review.id}`, { method: "PATCH", body: JSON.stringify({ hidden: !review.hidden }) });
      setReviews((cur) => cur.map((r) => (r.id === review.id ? updated : r)));
    } catch (e) {
      setErr(e.message || "Could not update review.");
    }
  };

  const deleteReview = async (review) => {
    if (!window.confirm("Delete this review permanently?")) return;
    try {
      await api(`/admin/reviews/${review.id}`, { method: "DELETE" });
      setReviews((cur) => cur.filter((r) => r.id !== review.id));
    } catch (e) {
      setErr(e.message || "Could not delete review.");
    }
  };

  const openCustomer = async (id) => {
    if (expandedCustomer === id) { setExpandedCustomer(null); return; }
    setExpandedCustomer(id);
    try {
      const detail = await api(`/admin/customers/${id}`);
      setCustomerDetail(detail);
    } catch (e) {
      setErr(e.message || "Could not load customer.");
    }
  };

  const saveCombo = async (e) => {
    e.preventDefault();
    setComboBusy(true);
    setErr("");
    try {
      const created = await api("/combos", {
        method: "POST",
        body: JSON.stringify({
          title: comboForm.title,
          category: comboForm.category,
          quantity: Number(comboForm.quantity),
          bundle_price: Number(comboForm.bundle_price),
        }),
      });
      setCombos((cur) => [created, ...cur]);
      setComboForm({ title: "", category: "", quantity: "", bundle_price: "" });
    } catch (e) {
      setErr(e.message || "Could not create combo deal.");
    } finally {
      setComboBusy(false);
    }
  };

  const toggleCombo = async (combo) => {
    try {
      const updated = await api(`/combos/${combo.id}`, { method: "PATCH", body: JSON.stringify({ active: !combo.active }) });
      setCombos((cur) => cur.map((c) => (c.id === combo.id ? updated : c)));
    } catch (e) {
      setErr(e.message || "Could not update combo deal.");
    }
  };

  const deleteCombo = async (combo) => {
    if (!window.confirm("Delete this combo deal?")) return;
    try {
      await api(`/combos/${combo.id}`, { method: "DELETE" });
      setCombos((cur) => cur.filter((c) => c.id !== combo.id));
    } catch (e) {
      setErr(e.message || "Could not delete combo deal.");
    }
  };

  const resolveContact = async (id, resolved) => {
    try {
      const updated = await api(`/contact/${id}`, { method: "PATCH", body: JSON.stringify({ resolved }) });
      setContactMessages((cur) => cur.map((m) => (m.id === id ? updated : m)));
    } catch (e) {
      setErr(e.message || "Could not update message.");
    }
  };

  const previewAbandoned = async () => {
    try {
      const rows = await api("/admin/abandoned-carts?hours_idle=2");
      setAbandonedPreview(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message || "Could not load abandoned carts.");
    }
  };

  const sendAbandonedEmails = async () => {
    setAbandonedBusy(true);
    setAbandonedResult(null);
    try {
      const result = await api("/admin/abandoned-carts/send", { method: "POST", body: JSON.stringify({ hours_idle: 2 }) });
      setAbandonedResult(result);
      previewAbandoned();
    } catch (e) {
      setErr(e.message || "Could not send abandoned cart emails.");
    } finally {
      setAbandonedBusy(false);
    }
  };

  useEffect(() => { if (tab === "abandoned") previewAbandoned(); }, [tab]);

  if (user?.role !== "admin") return null;

  return (
    <section className="admin-content admin-extras">
      <div className="admin-panel-header">
        <div>
          <p className="eyebrow">STORE MANAGEMENT</p>
          <h2>Customers, Reviews, Returns & Stock Alerts</h2>
        </div>
        <button type="button" className="admin-refresh" onClick={load}>
          <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>

      {err && <div className="admin-error">{err}</div>}

      <div className="admin-extras-tabs">
        <button type="button" className={tab === "returns" ? "active" : ""} onClick={() => setTab("returns")}>
          <Undo2 size={15} /> Returns <b>{returns.filter((r) => r.status === "requested").length}</b>
        </button>
        <button type="button" className={tab === "customers" ? "active" : ""} onClick={() => setTab("customers")}>
          <Users size={15} /> Customers <b>{customers.length}</b>
        </button>
        <button type="button" className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>
          <MessageSquareWarning size={15} /> Reviews <b>{reviews.length}</b>
        </button>
        <button type="button" className={tab === "alerts" ? "active" : ""} onClick={() => setTab("alerts")}>
          <PackageSearch size={15} /> Stock Alerts <b>{stockAlerts.reduce((s, a) => s + a.waiting_count, 0)}</b>
        </button>
        <button type="button" className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>
          <Boxes size={15} /> Inventory
        </button>
        <button type="button" className={tab === "giftcards" ? "active" : ""} onClick={() => setTab("giftcards")}>
          <Gift size={15} /> Gift Cards <b>{giftCards.length}</b>
        </button>
        <button type="button" className={tab === "combos" ? "active" : ""} onClick={() => setTab("combos")}>
          <Layers size={15} /> Combo Deals <b>{combos.filter((c) => c.active).length}</b>
        </button>
        <button type="button" className={tab === "abandoned" ? "active" : ""} onClick={() => setTab("abandoned")}>
          <Mail size={15} /> Abandoned Carts
        </button>
        <button type="button" className={tab === "contact" ? "active" : ""} onClick={() => setTab("contact")}>
          <MessageSquareWarning size={15} /> Messages <b>{contactMessages.filter((m) => !m.resolved).length}</b>
        </button>
        <button type="button" className={tab === "analytics" ? "active" : ""} onClick={() => setTab("analytics")}>
          <TrendingUp size={15} /> Analytics
        </button>
      </div>

      {tab === "returns" && (
        <div className="admin-product-list">
          {!returns.length && <div className="admin-empty"><p>No return or exchange requests yet.</p></div>}
          {returns.map((r) => {
            const eligibleForRefund = r.payment_method === "online" && r.payment_status === "paid" && r.status !== "refunded" && ["approved", "received"].includes(r.status);
            return (
              <article key={r.id} className="admin-product-card admin-return-card">
                <div className="admin-product-details">
                  <div className="admin-product-title">
                    <strong>{r.type === "exchange" ? "EXCHANGE" : "RETURN"} — OG{String(r.order_id).padStart(6, "0")}</strong>
                    <span className={`order-status return-status-${r.status}`}>{r.status.toUpperCase()}</span>
                  </div>
                  <p className="muted">{r.customer_name} · {r.customer_email}</p>
                  <p>{r.reason}</p>
                  {r.exchange_size && <p className="muted">Requested size: {r.exchange_size}</p>}
                  {r.razorpay_refund_id && <p className="muted">Refunded via Razorpay · {r.razorpay_refund_id} · ₹{r.refund_amount}</p>}
                  <div className="admin-product-actions admin-return-actions">
                    <select value={r.status} onChange={(e) => updateReturn(r.id, { status: e.target.value })}>
                      {RETURN_STATUSES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                    </select>
                    <input
                      placeholder="ADMIN NOTE (sent to customer)"
                      defaultValue={r.admin_notes || ""}
                      onBlur={(e) => { if (e.target.value !== (r.admin_notes || "")) updateReturn(r.id, { admin_notes: e.target.value }); }}
                    />
                  </div>
                  {eligibleForRefund && (
                    <div className="admin-refund-row">
                      <input
                        type="number"
                        min="1"
                        placeholder={`AMOUNT (default: full ₹${r.order_total})`}
                        id={`refund-amount-${r.id}`}
                      />
                      <button
                        type="button"
                        className="orange-btn"
                        disabled={refundingId === r.id}
                        onClick={() => issueRefund(r, document.getElementById(`refund-amount-${r.id}`).value)}
                      >
                        {refundingId === r.id ? "PROCESSING..." : "ISSUE RAZORPAY REFUND"}
                      </button>
                    </div>
                  )}
                  {r.type === "exchange" && r.replacement_status && (
                    <div className="admin-shipment-block">
                      <span className="admin-shipment-status">REPLACEMENT: {r.replacement_status.toUpperCase()}</span>
                      <div className="admin-shipment-row">
                        <input placeholder="COURIER" defaultValue={r.replacement_courier || ""} id={`ship-courier-${r.id}`} />
                        <input placeholder="AWB NUMBER" defaultValue={r.replacement_awb || ""} id={`ship-awb-${r.id}`} />
                        <input placeholder="TRACKING URL" defaultValue={r.replacement_tracking_url || ""} id={`ship-url-${r.id}`} />
                        <button type="button" onClick={() => updateShipment(r.id, {
                          courier: document.getElementById(`ship-courier-${r.id}`).value,
                          awb: document.getElementById(`ship-awb-${r.id}`).value,
                          tracking_url: document.getElementById(`ship-url-${r.id}`).value,
                        })}>SAVE</button>
                      </div>
                      <div className="admin-shipment-actions">
                        {r.replacement_status === "reserved" && (
                          <button type="button" className="orange-btn" onClick={() => updateShipment(r.id, { mark: "shipped" })}>MARK SHIPPED</button>
                        )}
                        {r.replacement_status === "shipped" && (
                          <button type="button" className="orange-btn" onClick={() => updateShipment(r.id, { mark: "delivered" })}>MARK DELIVERED</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "customers" && (
        <div className="admin-product-list">
          {!customers.length && <div className="admin-empty"><p>No customers yet.</p></div>}
          {customers.map((c) => (
            <article key={c.id} className="admin-product-card admin-customer-card">
              <div className="admin-product-details" onClick={() => openCustomer(c.id)} style={{ cursor: "pointer" }}>
                <div className="admin-product-title">
                  <strong>{c.name}</strong>
                  <span>{c.order_count} order{c.order_count === 1 ? "" : "s"} · {money(c.total_spent)}</span>
                </div>
                <p className="muted">{c.email} · joined {new Date(c.created_at).toLocaleDateString("en-IN")}</p>
                <p className="muted">{c.loyalty_points} points · {c.referral_count} referrals</p>
              </div>
              {expandedCustomer === c.id && customerDetail?.id === c.id && (
                <div className="admin-customer-expanded">
                  <h4>Recent orders</h4>
                  {customerDetail.orders.slice(0, 8).map((o) => (
                    <p key={o.id}>OG{String(o.id).padStart(6, "0")} · {money(o.total)} · {String(o.status).toUpperCase()}</p>
                  ))}
                  {!customerDetail.orders.length && <p className="muted">No orders yet.</p>}
                  <h4>Addresses</h4>
                  {customerDetail.addresses.map((a) => (
                    <p key={a.id}>{a.label}: {a.address}, {a.city}, {a.state} — {a.pincode}</p>
                  ))}
                  {!customerDetail.addresses.length && <p className="muted">No saved addresses.</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <div className="admin-product-list">
          {!reviews.length && <div className="admin-empty"><p>No reviews yet.</p></div>}
          {reviews.map((r) => (
            <article key={r.id} className={`admin-product-card ${r.hidden ? "admin-product-sold" : ""}`}>
              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{r.product_name}</strong>
                  <span>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {r.user_name}</span>
                </div>
                <p>{r.comment || <em>No comment left.</em>}</p>
                <div className="admin-product-actions">
                  <button type="button" onClick={() => toggleReviewHidden(r)}>
                    {r.hidden ? <><Eye size={15} /> Unhide</> : <><EyeOff size={15} /> Hide</>}
                  </button>
                  <button type="button" className="delete" onClick={() => deleteReview(r)}>
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "alerts" && (
        <div className="admin-product-list">
          {!stockAlerts.length && <div className="admin-empty"><p>No customers are waiting on restocks right now.</p></div>}
          {stockAlerts.map((a) => (
            <article key={a.product_id} className="admin-product-card">
              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{a.product_name}</strong>
                  <span>{a.waiting_count} waiting</span>
                </div>
                <p className="muted">Current stock: {a.stock} · {a.notified_count} already notified</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "inventory" && (
        <div className="admin-product-list">
          <p className="muted admin-inventory-note">Set stock per size/color combination. Products left without variants keep using their single stock number.</p>
          {inventoryProducts.map((p) => (
            <article key={p.id} className="admin-product-card">
              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{p.name}</strong>
                  <span>{Array.isArray(p.variants) && p.variants.length ? `${p.variants.length} SKUs tracked` : "No variants set — using single stock"}</span>
                </div>
                <div className="admin-product-actions">
                  <button type="button" onClick={() => setEditingVariantsFor(editingVariantsFor === p.id ? null : p.id)}>
                    {editingVariantsFor === p.id ? "Close" : "Manage Sizes/Stock"}
                  </button>
                  <button type="button" onClick={() => setLedgerFor(ledgerFor === p.id ? null : p.id)}>
                    {ledgerFor === p.id ? "Hide History" : "Inventory History"}
                  </button>
                </div>
                {editingVariantsFor === p.id && (
                  <VariantEditor product={p} onClose={() => setEditingVariantsFor(null)} onSaved={load} />
                )}
                {ledgerFor === p.id && (
                  <div className="admin-variant-editor">
                    <h4>INVENTORY HISTORY — {p.name}</h4>
                    <StockLedger productId={p.id} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "giftcards" && (
        <div className="admin-product-list">
          {!giftCards.length && <div className="admin-empty"><p>No gift cards purchased yet.</p></div>}
          {giftCards.map((g) => (
            <article key={g.id} className="admin-product-card">
              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{g.code}</strong>
                  <span>{g.payment_status === "paid" ? `${money(g.balance)} of ${money(g.initial_value)} remaining` : "PAYMENT PENDING/ABANDONED"}</span>
                </div>
                <p className="muted">To: {g.recipient_email} · {g.active ? "Active" : "Inactive"} · {new Date(g.created_at).toLocaleDateString("en-IN")}{g.resent_count > 0 ? ` · resent ${g.resent_count}x` : ""}</p>
                {g.payment_status === "paid" && (
                  <div className="admin-product-actions">
                    <button type="button" disabled={resendingId === g.id} onClick={() => resendGiftCard(g)}>
                      {resendingId === g.id ? "SENDING..." : "RESEND EMAIL"}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "combos" && (
        <>
          <form className="admin-combo-form" onSubmit={saveCombo}>
            <input required placeholder="TITLE (e.g. Any 3 Tees Combo)" value={comboForm.title} onChange={(e) => setComboForm((f) => ({ ...f, title: e.target.value }))} />
            <input required placeholder="CATEGORY (e.g. T-SHIRTS)" value={comboForm.category} onChange={(e) => setComboForm((f) => ({ ...f, category: e.target.value }))} />
            <input required type="number" min="2" placeholder="QUANTITY" value={comboForm.quantity} onChange={(e) => setComboForm((f) => ({ ...f, quantity: e.target.value }))} />
            <input required type="number" min="1" placeholder="BUNDLE PRICE (₹)" value={comboForm.bundle_price} onChange={(e) => setComboForm((f) => ({ ...f, bundle_price: e.target.value }))} />
            <button className="orange-btn" disabled={comboBusy}>{comboBusy ? "SAVING..." : "ADD COMBO DEAL"}</button>
          </form>
          <div className="admin-product-list">
            {!combos.length && <div className="admin-empty"><p>No combo deals yet.</p></div>}
            {combos.map((c) => (
              <article key={c.id} className={`admin-product-card ${!c.active ? "admin-product-sold" : ""}`}>
                <div className="admin-product-details">
                  <div className="admin-product-title">
                    <strong>{c.title}</strong>
                    <span>Any {c.quantity} from {c.category} for {money(c.bundle_price)}</span>
                  </div>
                  <div className="admin-product-actions">
                    <button type="button" onClick={() => toggleCombo(c)}>{c.active ? "Deactivate" : "Activate"}</button>
                    <button type="button" className="delete" onClick={() => deleteCombo(c)}><Trash2 size={15} /> Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "abandoned" && (
        <div className="admin-product-list">
          <div className="admin-abandoned-actions">
            <p className="muted">Carts idle 2+ hours that haven't already been emailed about. This has to be triggered manually or from an external scheduler (e.g. a Render Cron Job hitting POST /api/admin/abandoned-carts/send) since this app has no background job runner.</p>
            <button type="button" className="orange-btn" disabled={abandonedBusy} onClick={sendAbandonedEmails}>
              {abandonedBusy ? "SENDING..." : "SEND RECOVERY EMAILS NOW"}
            </button>
            {abandonedResult && <p className="muted">{abandonedResult.emails_sent} email{abandonedResult.emails_sent === 1 ? "" : "s"} sent.</p>}
          </div>
          {!abandonedPreview.length && <div className="admin-empty"><p>No abandoned carts right now.</p></div>}
          {abandonedPreview.map((a, i) => (
            <article key={i} className="admin-product-card">
              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{a.name || a.email}</strong>
                  <span>{a.item_count} item{a.item_count === 1 ? "" : "s"}</span>
                </div>
                <p className="muted">{a.email} · last touched {new Date(a.last_updated).toLocaleString("en-IN")}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "contact" && (
        <div className="admin-product-list">
          {!contactMessages.length && <div className="admin-empty"><p>No customer messages yet.</p></div>}
          {contactMessages.map((m) => (
            <article key={m.id} className={`admin-product-card ${m.resolved ? "admin-product-sold" : ""}`}>
              <div className="admin-product-details">
                <div className="admin-product-title">
                  <strong>{m.name} · {(m.topic || "general").replace(/-/g, " ").toUpperCase()}</strong>
                  <span>{new Date(m.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="muted">{m.email}</p>
                <p>{m.message}</p>
                <div className="admin-product-actions">
                  <button type="button" onClick={() => resolveContact(m.id, !m.resolved)}>
                    {m.resolved ? "Mark unresolved" : "Mark resolved"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "analytics" && analytics && (
        <div className="admin-analytics">
          <div className="admin-kpi-grid">
            <div><span>TODAY</span><strong>{money(analytics.revenue.today)}</strong></div>
            <div><span>THIS WEEK</span><strong>{money(analytics.revenue.this_week)}</strong></div>
            <div><span>THIS MONTH</span><strong>{money(analytics.revenue.this_month)}</strong></div>
            <div><span>THIS YEAR</span><strong>{money(analytics.revenue.this_year)}</strong></div>
            <div><span>ORDERS</span><strong>{analytics.revenue.order_count}</strong></div>
            <div><span>AOV</span><strong>{money(analytics.revenue.aov)}</strong></div>
            <div><span>CANCELLED</span><strong>{analytics.revenue.cancelled_count} / {analytics.revenue.total_orders}</strong></div>
            <div><span>REPEAT CUSTOMERS</span><strong>{analytics.customers.repeat_customers} / {analytics.customers.total_customers}</strong></div>
          </div>

          <div className="admin-analytics-cols">
            <div>
              <h4>BESTSELLERS</h4>
              {analytics.best_products.map((p) => (
                <div key={p.id} className="admin-analytics-row"><span>{p.name}</span><b>{p.units_sold} sold · {money(p.revenue)}</b></div>
              ))}
              {!analytics.best_products.length && <p className="muted">No sales data yet.</p>}
            </div>
            <div>
              <h4>BEST SIZES</h4>
              {analytics.best_sizes.map((s) => (
                <div key={s.size} className="admin-analytics-row"><span>{s.size}</span><b>{s.units_sold} sold</b></div>
              ))}
              {!analytics.best_sizes.length && <p className="muted">No variant sales data yet.</p>}
            </div>
            <div>
              <h4>BEST COLOURS</h4>
              {analytics.best_colors.map((c) => (
                <div key={c.color} className="admin-analytics-row"><span>{c.color}</span><b>{c.units_sold} sold</b></div>
              ))}
              {!analytics.best_colors.length && <p className="muted">No variant sales data yet.</p>}
            </div>
            <div>
              <h4>LOW STOCK</h4>
              {analytics.low_stock.map((p) => (
                <div key={p.id} className="admin-analytics-row"><span>{p.name}</span><b>{p.stock} left</b></div>
              ))}
              {!analytics.low_stock.length && <p className="muted">Nothing low on stock.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
