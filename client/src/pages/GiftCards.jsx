import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";
import { api } from "../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector('script[data-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Razorpay")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "true";
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });

export default function GiftCards({ user }) {
  const nav = useNavigate();
  const [amounts, setAmounts] = useState([500, 1000, 2000, 5000]);
  const [amount, setAmount] = useState(1000);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [mine, setMine] = useState([]);

  useEffect(() => {
    api("/gift-cards/amounts").then((data) => Array.isArray(data) && setAmounts(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    api("/gift-cards/mine").then((data) => Array.isArray(data) && setMine(data)).catch(() => {});
  }, [user, done]);

  /*
    Gift cards now go through a real Razorpay payment before the card
    is created/activated — previously this called /gift-cards/purchase
    and the card was live immediately with no payment at all. This
    mirrors the exact same order-payment flow used at checkout:
    create a Razorpay order -> open the payment modal -> verify the
    signed payment server-side -> only then is the card active.
  */
  const submit = async (e) => {
    e.preventDefault();
    if (!user) { nav("/account"); return; }

    const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!key) {
      setErr("Online payment is not configured yet — please try again later.");
      return;
    }

    setErr("");
    setBusy(true);

    try {
      await loadRazorpay();

      const pending = await api("/gift-cards/purchase", {
        method: "POST",
        body: JSON.stringify({
          amount,
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim(),
          message: message.trim(),
        }),
      });

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key,
          amount: Math.round(pending.amount * 100),
          currency: "INR",
          name: "THE OFF GRID",
          description: `Gift card for ${recipientEmail.trim()}`,
          order_id: pending.razorpay_order_id,
          prefill: { name: user?.name, email: user?.email },
          theme: { color: "#111111" },
          handler: async (payment) => {
            try {
              const card = await api("/gift-cards/verify-payment", {
                method: "POST",
                body: JSON.stringify({
                  giftCardId: pending.giftCardId,
                  razorpay_order_id: payment.razorpay_order_id,
                  razorpay_payment_id: payment.razorpay_payment_id,
                  razorpay_signature: payment.razorpay_signature,
                }),
              });
              setDone(card);
              setRecipientEmail("");
              setRecipientName("");
              setMessage("");
              resolve();
            } catch (err) {
              reject(new Error(err.message || "Payment verification failed. Please contact support before retrying."));
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment was cancelled — no gift card was created.")),
          },
        });
        rzp.on("payment.failed", (response) => {
          reject(new Error(response?.error?.description || "Payment failed. No gift card was created."));
        });
        rzp.open();
      });
    } catch (e) {
      setErr(e.message || "Could not purchase gift card.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <span>THE OFF GRID / GIFT CARDS</span>
        <h1>GIVE THE <em>GRID.</em></h1>
      </div>

      <div className="giftcard-layout">
        <form className="giftcard-form" onSubmit={submit}>
          <h2>CHOOSE AN AMOUNT</h2>
          <div className="giftcard-amounts">
            {amounts.map((a) => (
              <button type="button" key={a} className={amount === a ? "active" : ""} onClick={() => setAmount(a)}>{money(a)}</button>
            ))}
          </div>

          <h2>RECIPIENT</h2>
          <input required type="email" placeholder="RECIPIENT EMAIL" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
          <input placeholder="RECIPIENT NAME (OPTIONAL)" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          <textarea placeholder="PERSONAL MESSAGE (OPTIONAL)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />

          {err && <p className="notify-me-error">{err}</p>}
          {!user && <p className="notify-me-error">Sign in to purchase a gift card.</p>}

          <button className="orange-btn" disabled={busy}>
            <Gift size={16} /> {busy ? "PROCESSING..." : `PAY & SEND ${money(amount)} GIFT CARD`}
          </button>
        </form>

        <div className="giftcard-side">
          {done && (
            <div className="giftcard-success">
              <h3>SENT.</h3>
              <p>Code {done.code} for {money(done.initial_value)} has been emailed to {done.recipient_email}.</p>
            </div>
          )}

          {user && mine.length > 0 && (
            <div className="giftcard-history">
              <h3>GIFT CARDS YOU'VE SENT</h3>
              {mine.map((c) => (
                <div key={c.id}>
                  <strong>{c.code}</strong>
                  <span>{money(c.balance)} of {money(c.initial_value)} remaining · to {c.recipient_email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
