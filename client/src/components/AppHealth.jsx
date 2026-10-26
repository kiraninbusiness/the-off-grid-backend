import React, { useEffect, useState } from "react";
import { api } from "../api";

// Admin view of what the mobile app reports: anonymous usage counts and grouped error reports.
export default function AppHealth() {
  const [days, setDays] = useState(7);
  const [events, setEvents] = useState([]);
  const [errors, setErrors] = useState({ total: 0, groups: [] });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    Promise.all([api(`/analytics/events?days=${days}`), api(`/client-errors?days=${days}`)])
      .then(([ev, er]) => {
        if (!alive) return;
        setEvents(Array.isArray(ev.rows) ? ev.rows : []);
        setErrors({ total: er.total || 0, groups: Array.isArray(er.groups) ? er.groups : [] });
      })
      .catch((e) => alive && setErr(e.message || "Could not load app data"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [days]);

  const totals = {};
  for (const r of events) totals[r.event] = (totals[r.event] || 0) + Number(r.count || 0);
  const opened = totals.app_opened || 0;
  const rate = (n) => (opened ? `${Math.round((n / opened) * 100)}%` : "—");
  const funnel = [
    ["app_opened", "APP OPENS"],
    ["product_viewed", "PRODUCT VIEWS"],
    ["add_to_cart", "ADDED TO BAG"],
    ["checkout_started", "CHECKOUT STARTED"],
  ];

  return (
    <div className="admin-analytics">
      <div className="admin-analytics-head">
        <h3>APP HEALTH</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {err && <p className="muted">{err}</p>}
      {loading && <p className="muted">Loading…</p>}

      <h4>USAGE (ANONYMOUS COUNTS)</h4>
      {funnel.map(([key, label]) => (
        <div key={key} className="admin-analytics-row">
          <span>{label}</span>
          <b>{totals[key] || 0}{key !== "app_opened" ? ` · ${rate(totals[key] || 0)} of opens` : ""}</b>
        </div>
      ))}
      {!events.length && !loading && <p className="muted">No app usage recorded in this period yet.</p>}

      <h4 style={{ marginTop: 24 }}>APP ERRORS ({errors.total})</h4>
      {errors.groups.map((g) => (
        <div key={g.fingerprint} className="admin-analytics-row" style={{ alignItems: "flex-start" }}>
          <span>
            <strong>{g.message}</strong>
            <br />
            <small>
              {g.platform} · v{g.app_version || "?"}{g.screen ? ` · ${g.screen}` : ""} · last seen {new Date(g.last_seen).toLocaleString("en-IN")}
            </small>
            {g.stack && (
              <details>
                <summary>Stack</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 10 }}>{g.stack}</pre>
              </details>
            )}
          </span>
          <b>{g.count}×{g.fatal_count ? ` (${g.fatal_count} fatal)` : ""}</b>
        </div>
      ))}
      {!errors.groups.length && !loading && <p className="muted">No app errors reported. 🎉</p>}
    </div>
  );
}
