import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function Success() {
  const { state } = useLocation();
  const order = state?.order;
  const displayId = order?.id ? `OG${String(order.id).replace(/^OG/, "").padStart(6, "0")}` : null;

  return (
    <div className="success-page">
      <span>THE OFF GRID / COMPLETE</span>
      <h1>ORDER<br /><em>PLACED.</em></h1>
      <p>{displayId ? `Your order ${displayId} has been received.` : "Your order has been received."}</p>
      {order?.payment_status && <small>PAYMENT: {String(order.payment_status).toUpperCase()}</small>}
      <div>
        <Link className="orange-btn" to="/">CONTINUE SHOPPING</Link>
        <Link className="outline-btn" to="/orders">VIEW ORDERS</Link>
      </div>
    </div>
  );
}
