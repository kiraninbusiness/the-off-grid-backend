import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { api } from "../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/*
  Printable invoice — no PDF library involved. "Download PDF" uses the
  browser's own print-to-PDF (window.print() with print-only CSS in
  styles.css under @media print), which needs zero new dependencies
  and works identically in every browser. If you'd rather generate a
  true server-side PDF later (for automated emailing, for instance),
  this page's layout is the template to port into a PDF library.

  GST: intentionally NOT shown as a broken-out CGST/SGST/IGST line —
  doing that with a made-up rate would be actively wrong. The order
  total is shown as-is. Once your real GSTIN and applicable rate are
  confirmed, add the breakdown fields here and to the order schema.
*/
export default function Invoice() {
  const location = useLocation();
  const navigate = useNavigate();
  const id = location.pathname.split("/invoice/")[1]?.split("/")[0];
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api(`/orders/${id}`)
      .then(setOrder)
      .catch((e) => setError(e.message || "Order not found"));
  }, [id]);

  if (error) {
    return (
      <div className="page">
        <div className="empty-box"><h2>{error}</h2></div>
      </div>
    );
  }

  if (!order) {
    return <div className="page"><div className="empty-box"><h2>LOADING...</h2></div></div>;
  }

  const invoiceNo = `INV-${String(order.id).padStart(6, "0")}`;
  const orderNo = `OG${String(order.id).padStart(6, "0")}`;
  const subtotal = order.items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
  const totalDiscount =
    Number(order.discount || 0) +
    Number(order.coupon_discount || 0) +
    Number(order.gift_card_discount || 0) +
    Number(order.combo_discount || 0);

  return (
    <div className="page invoice-page">
      <div className="invoice-toolbar no-print">
        <button type="button" className="text-button" onClick={() => navigate(-1)}><ArrowLeft size={16} /> BACK</button>
        <button type="button" className="orange-btn" onClick={() => window.print()}><Printer size={16} /> DOWNLOAD / PRINT PDF</button>
      </div>

      <div className="invoice-sheet">
        <div className="invoice-head">
          <div>
            <strong className="invoice-brand">THE OFF GRID</strong>
            <p>[Company legal name]<br />[Company address]<br />GSTIN: [your GSTIN, if registered]</p>
          </div>
          <div className="invoice-meta">
            <p><span>Invoice No.</span><strong>{invoiceNo}</strong></p>
            <p><span>Order No.</span><strong>{orderNo}</strong></p>
            <p><span>Date</span><strong>{new Date(order.created_at).toLocaleDateString("en-IN")}</strong></p>
          </div>
        </div>

        <div className="invoice-addresses">
          <div>
            <span>BILL / SHIP TO</span>
            <p>
              {order.shipping_name}<br />
              {order.shipping_address}<br />
              {order.shipping_city}, {order.shipping_state} — {order.shipping_pincode}<br />
              {order.shipping_phone}
            </p>
          </div>
          <div>
            <span>PAYMENT</span>
            <p>
              Method: {String(order.payment_method || "cod").toUpperCase()}<br />
              Status: {String(order.payment_status || "pending").toUpperCase()}<br />
              {order.razorpay_payment_id && <>Payment ID: {order.razorpay_payment_id}</>}
            </p>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr><th>Product</th><th>Size / Colour</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i}>
                <td>{item.name}</td>
                <td>{[item.selected_size, item.selected_color].filter(Boolean).join(" / ") || "—"}</td>
                <td>{item.quantity}</td>
                <td>{money(item.price)}</td>
                <td>{money(Number(item.price) * Number(item.quantity))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <p><span>Subtotal</span><b>{money(subtotal)}</b></p>
          {totalDiscount > 0 && <p><span>Discount</span><b>-{money(totalDiscount)}</b></p>}
          <p className="invoice-grand-total"><span>Total (tax inclusive)</span><b>{money(order.total)}</b></p>
        </div>

        <p className="invoice-footnote">This is a computer-generated invoice from THE OFF GRID. Prices shown are inclusive of applicable taxes.</p>
      </div>
    </div>
  );
}
