import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { api } from "../api";

export default function ResetPassword() {
  const nav = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (password.length < 12) {
      setErr("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (e) {
      setErr(e.message || "Could not reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page account-page">
      <div className="page-head">
        <span>THE OFF GRID / ACCOUNT</span>
        <h1>RESET <em>PASSWORD.</em></h1>
      </div>

      {!token ? (
        <div className="empty-box">
          <h2>INVALID OR MISSING RESET LINK.</h2>
          <button className="orange-btn" onClick={() => nav("/account")}>BACK TO SIGN IN</button>
        </div>
      ) : done ? (
        <div className="empty-box">
          <h2>PASSWORD CHANGED SUCCESSFULLY.</h2>
          <button className="orange-btn" onClick={() => nav("/account")}>SIGN IN NOW</button>
        </div>
      ) : (
        <form className="login-form account-auth-card" onSubmit={submit}>
          <div className="account-auth-intro">
            <ShieldCheck size={22} />
            <span>CHOOSE A NEW PASSWORD</span>
          </div>
          <input
            required
            type="password"
            placeholder="NEW PASSWORD (12+ CHARACTERS)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            required
            type="password"
            placeholder="CONFIRM NEW PASSWORD"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {err && <p className="notify-me-error">{err}</p>}
          <button className="orange-btn" disabled={busy}>{busy ? "SAVING..." : "SAVE NEW PASSWORD"}</button>
        </form>
      )}
    </div>
  );
}
