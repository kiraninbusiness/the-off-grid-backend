import React, { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { api } from "../api";

const TOPICS = [
  { value: "order-tracking", label: "Track my order" },
  { value: "payment", label: "Payment problem" },
  { value: "return", label: "Return" },
  { value: "exchange", label: "Exchange" },
  { value: "refund", label: "Refund" },
  { value: "sizing", label: "Size assistance" },
  { value: "general", label: "General question" },
];

export default function Contact({ user }) {
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    topic: "general",
    message: "",
  });
  const [status, setStatus] = useState("idle");

  const submit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    try {
      await api("/contact", { method: "POST", body: JSON.stringify(form) });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  const whatsappNumber = (import.meta.env.VITE_WHATSAPP_NUMBER || "911234567890").replace(/\D/g, "");

  return (
    <div className="page info-page contact-page">
      <div className="page-head">
        <span>THE OFF GRID / CONTACT</span>
        <h1>GET IN <em>TOUCH.</em></h1>
      </div>

      <div className="contact-grid">
        <div className="contact-details">
          <div><Mail size={18} /><div><span>EMAIL US</span><strong>support@theoffgrid.in</strong></div></div>
          <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /><div><span>WHATSAPP</span><strong>Chat with us directly</strong></div>
          </a>
        </div>

        <form className="login-form contact-form" onSubmit={submit}>
          {status === "success" ? (
            <p className="notify-me-success">Thanks — we've got your message and will get back to you within 24 hours.</p>
          ) : (
            <>
              <input required placeholder="NAME" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input required type="email" placeholder="EMAIL" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
                {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <textarea required placeholder="HOW CAN WE HELP?" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              {status === "error" && <p className="notify-me-error">Something went wrong — please try again, or message us on WhatsApp.</p>}
              <button className="orange-btn" disabled={status === "loading"}>{status === "loading" ? "SENDING..." : "SEND MESSAGE"}</button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
