import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Truck, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { api } from "../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function StatusIcon({ status }) {
  if (status === "delivered") return <CheckCircle2 size={15} />;
  if (status === "shipped") return <Truck size={15} />;
  if (status === "processing") return <Package size={15} />;
  if (status === "cancelled") return <XCircle size={15} />;
  return <Clock3 size={15} />;
}

const RETURN_WINDOW_DAYS = 10;

function withinReturnWindow(order) {
  if (!order.delivered_at) return true; // legacy orders without a timestamp: let the backend be the source of truth
  const deadline = new Date(order.delivered_at).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() <= deadline;
}

function ReturnForm({ order, onDone, onCancel }) {
  const [type, setType] = useState("return");
  const [reason, setReason] = useState("");
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setErr("Please tell us why."); return; }
    setBusy(true);
    setErr("");
    try {
      const created = await api("/returns", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          type,
          reason: reason.trim(),
          exchange_size: type === "exchange" ? size : null,
        }),
      });
      onDone(created);
    } catch (e) {
      setErr(e.message || "Could not submit request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="return-request-form" onSubmit={submit}>
      <div className="payment-options">
        <button type="button" className={type === "return" ? "active" : ""} onClick={() => setType("return")}>RETURN</button>
        <button type="button" className={type === "exchange" ? "active" : ""} onClick={() => setType("exchange")}>EXCHANGE</button>
      </div>
      {type === "exchange" && (
        <input placeholder="DESIRED SIZE" value={size} onChange={(e) => setSize(e.target.value)} />
      )}
      <textarea
        required
        placeholder="REASON (e.g. wrong size, damaged, changed my mind)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
      />
      {err && <p className="notify-me-error">{err}</p>}
      <div>
        <button className="orange-btn" disabled={busy}>{busy ? "SUBMITTING..." : "SUBMIT REQUEST"}</button>
        <button type="button" className="text-button" onClick={onCancel}>CANCEL</button>
      </div>
    </form>
  );
}

function AddressEditForm({ order, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: order.shipping_name || "",
    phone: order.shipping_phone || "",
    address: order.shipping_address || "",
    city: order.shipping_city || "",
    state: order.shipping_state || "",
    pincode: order.shipping_pincode || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const updated = await api(`/orders/${order.id}/address`, { method: "PATCH", body: JSON.stringify(form) });
      onDone(updated);
    } catch (e) {
      setErr(e.message || "Could not update address.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="return-request-form" onSubmit={submit}>
      {["name", "phone", "address", "city", "state", "pincode"].map((key) => (
        <input
          key={key}
          required
          placeholder={key.toUpperCase()}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      ))}
      {err && <p className="notify-me-error">{err}</p>}
      <div>
        <button className="orange-btn" disabled={busy}>{busy ? "SAVING..." : "SAVE ADDRESS"}</button>
        <button type="button" className="text-button" onClick={onCancel}>CANCEL</button>
      </div>
    </form>
  );
}

function ItemEditRow({ order, item, onDone }) {
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState([]);
  const [size, setSize] = useState(item.selected_size || "");
  const [qty, setQty] = useState(item.quantity);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const openEditor = async () => {
    setOpen(true);
    if (item.product_id) {
      try {
        const product = await api(`/products/${item.product_id}`);
        const list = String(product.size || "").split("/").map((s) => s.trim()).filter(Boolean);
        setSizes(list);
      } catch { /* product may have been removed — size change just won't be offered */ }
    }
  };

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/orders/${order.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ selected_size: size || item.selected_size, quantity: qty }),
      });
      onDone();
      setOpen(false);
    } catch (e) {
      setErr(e.message || "Could not update item.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${item.name} from this order?`)) return;
    setBusy(true);
    setErr("");
    try {
      await api(`/orders/${order.id}/items/${item.id}`, { method: "DELETE" });
      onDone();
    } catch (e) {
      setErr(e.message || "Could not remove item.");
      setBusy(false);
    }
  };

  if (!open) {
    return <button type="button" className="text-button item-edit-toggle" onClick={openEditor}>EDIT</button>;
  }

  return (
    <div className="item-edit-panel">
      {sizes.length > 0 && (
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <div className="product-quantity">
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
        <span>{qty}</span>
        <button type="button" onClick={() => setQty((q) => q + 1)}>+</button>
      </div>
      {err && <p className="notify-me-error">{err}</p>}
      <button type="button" className="text-button" disabled={busy} onClick={save}>SAVE</button>
      <button type="button" className="text-button danger-link" disabled={busy} onClick={remove}>REMOVE ITEM</button>
      <button type="button" className="text-button" onClick={() => setOpen(false)}>CANCEL</button>
    </div>
  );
}

export default function Orders({ orders = [], onCancel, loading = false, onRefresh = () => {} }) {
  const [returns, setReturns] = useState([]);
  const [openReturnFor, setOpenReturnFor] = useState(null);
  const [editingAddressFor, setEditingAddressFor] = useState(null);

  useEffect(() => {
    api("/returns/mine").then((rows) => setReturns(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [orders.length]);

  const returnFor = (orderId) => returns.find((r) => String(r.order_id) === String(orderId));

  return (
    <div className="page">
      <div className="page-head">
        <span>THE OFF GRID / ORDERS</span>
        <h1>YOUR <em>ORDERS.</em></h1>
      </div>

      {loading ? (
        <div className="empty-box"><h2>LOADING ORDERS...</h2></div>
      ) : orders.length ? (
        <div className="orders-list">
          {orders.map((order) => {
            const displayId = `OG${String(order.id).padStart(6, "0")}`;
            const date = order.created_at || order.date;
            const payment = String(order.payment_method || order.payment || "cod").toUpperCase();
            const items = Array.isArray(order.items) ? order.items : [];
            const existingReturn = returnFor(order.id);
            const canRequestReturn = order.status === "delivered" && !existingReturn && withinReturnWindow(order);

            return (
              <article className="order-card" key={order.id}>
                <div>
                  <strong>{displayId}</strong>
                  <span>{date ? new Date(date).toLocaleDateString("en-IN") : "—"}</span>
                </div>

                <h3>{items.length ? items.map((item) => `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`).join(", ") : "THE OFF GRID ORDER"}</h3>
                <p>{money(order.total)} · {payment}</p>

                {["pending", "processing"].includes(order.status) && items.length > 0 && (
                  <div className="order-items-editable">
                    {items.map((item) => (
                      <div className="order-item-editable-row" key={item.id}>
                        <span>{item.name}{item.selected_size ? ` · ${item.selected_size}` : ""} × {item.quantity}</span>
                        <ItemEditRow order={order} item={item} onDone={onRefresh} />
                      </div>
                    ))}
                  </div>
                )}

                <span className={`order-status ${order.status}`}>
                  <StatusIcon status={order.status} />
                  {String(order.status || "pending").toUpperCase()}
                </span>

                {existingReturn && (
                  <span className={`order-status return-status-${existingReturn.status}`}>
                    {existingReturn.type === "exchange" ? "EXCHANGE" : "RETURN"}: {existingReturn.status.toUpperCase()}
                  </span>
                )}

                <div className="order-actions">
                  {order.status !== "cancelled" && (
                    <Link className="text-button" to={`/track-order/${order.id}`}>TRACK ORDER</Link>
                  )}
                  <Link className="text-button" to={`/invoice/${order.id}`}>VIEW INVOICE</Link>
                  {order.status === "pending" && payment === "COD" && (
                    <button className="text-button" onClick={() => onCancel(order.id)}>CANCEL ORDER</button>
                  )}
                  {["pending", "processing"].includes(order.status) && editingAddressFor !== order.id && (
                    <button className="text-button" onClick={() => setEditingAddressFor(order.id)}>CHANGE ADDRESS</button>
                  )}
                  {canRequestReturn && openReturnFor !== order.id && (
                    <button className="text-button" onClick={() => setOpenReturnFor(order.id)}>REQUEST RETURN / EXCHANGE</button>
                  )}
                </div>

                {editingAddressFor === order.id && (
                  <AddressEditForm
                    order={order}
                    onCancel={() => setEditingAddressFor(null)}
                    onDone={() => { setEditingAddressFor(null); onRefresh(); }}
                  />
                )}

                {openReturnFor === order.id && (
                  <ReturnForm
                    order={order}
                    onCancel={() => setOpenReturnFor(null)}
                    onDone={(created) => { setReturns((cur) => [created, ...cur]); setOpenReturnFor(null); }}
                  />
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-box">
          <h2>NO ORDERS YET.</h2>
          <Link className="orange-btn" to="/">START SHOPPING</Link>
        </div>
      )}
    </div>
  );
}
