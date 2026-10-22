import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, Package, Truck, XCircle } from "lucide-react";
import { api } from "../api";

const steps = ["pending", "processing", "shipped", "delivered"];

export default function TrackOrder({ orders = [] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const id = location.pathname.split("/track-order/")[1]?.split("/")[0];
  const existing = orders.find((item) => String(item.id) === String(id));
  const [order, setOrder] = useState(existing || null);
  const [loading, setLoading] = useState(!existing);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (existing) {
      setOrder(existing);
      setLoading(false);
      return undefined;
    }

    if (!id) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    api(`/orders/${id}`)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Order not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, existing]);

  const current = order ? steps.indexOf(order.status) : -1;
  const displayId = order ? `OG${String(order.id).padStart(6, "0")}` : id;

  return (
    <div className="page track-page">
      <div className="page-head">
        <span>THE OFF GRID / TRACKING</span>
        <h1>TRACK <em>YOUR ORDER.</em></h1>
      </div>

      {loading ? (
        <div className="empty-box"><h2>LOADING ORDER...</h2></div>
      ) : order ? (
        <div className="track-card">
          <div className="track-card-head">
            <div>
              <small>ORDER</small>
              <h2>{displayId}</h2>
            </div>
            <span className={`order-status ${order.status}`}>
              {order.status === "cancelled" ? <XCircle size={15} /> : <Clock3 size={15} />}
              {String(order.status || "pending").toUpperCase()}
            </span>
          </div>

          {order.status === "cancelled" ? (
            <p className="notify-me-error">This order was cancelled and its reserved stock was released.</p>
          ) : (
            <div className="tracking-steps">
              {steps.map((status, index) => (
                <div className={index <= current ? "done" : ""} key={status}>
                  <b>
                    {index < current ? <CheckCircle2 size={15} /> : index === current ? <Package size={15} /> : <Truck size={15} />}
                  </b>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          )}

          <div className="track-order-meta">
            <p>Shipping to {order.shipping_city || order.customer?.city || "—"}, {order.shipping_state || order.customer?.state || "—"} · {order.shipping_pincode || order.customer?.pincode || "—"}</p>
            <p>Payment: {String(order.payment_method || order.payment || "cod").toUpperCase()} · {String(order.payment_status || "pending").toUpperCase()}</p>
            {order.delivered_at && <p>Delivered on {new Date(order.delivered_at).toLocaleDateString("en-IN")} · eligible for return/exchange for 10 days from delivery</p>}
          </div>

          <button className="text-button" type="button" onClick={() => navigate("/orders")}>BACK TO ORDERS</button>
        </div>
      ) : (
        <div className="empty-box">
          <h2>{error || "ORDER NOT FOUND."}</h2>
          <button className="orange-btn" type="button" onClick={() => navigate("/orders")}>VIEW ORDERS</button>
        </div>
      )}
    </div>
  );
}
