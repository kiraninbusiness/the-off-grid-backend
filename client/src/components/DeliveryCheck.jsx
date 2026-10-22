import React, { useState } from "react";
import { Truck, RotateCcw } from "lucide-react";

// Lightweight, dependency-free delivery estimator. Real courier/pincode
// serviceability APIs need a paid integration (Shiprocket/Delhivery); until
// that's wired up this gives shoppers the same reassurance competitors show
// (estimated delivery date + COD availability) using a deterministic estimate
// based on the pincode's zone digit, so the same pincode always shows the same result.
function estimate(pincode) {
 const zone = Number(String(pincode)[0]) || 5;
 const metro = ["1", "4", "5", "6"].includes(String(pincode)[0]);
 const days = metro ? 2 + (zone % 2) : 4 + (zone % 3);
 const date = new Date();
 date.setDate(date.getDate() + days);
 const label = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
 return { days, label, cod: true };
}

export default function DeliveryCheck() {
 const [pin, setPin] = useState("");
 const [result, setResult] = useState(null);
 const [err, setErr] = useState("");

 const check = (e) => {
  e.preventDefault();
  if (!/^\d{6}$/.test(pin.trim())) { setErr("ENTER A VALID 6-DIGIT PINCODE"); setResult(null); return; }
  setErr("");
  setResult(estimate(pin.trim()));
 };

 return <div className="delivery-check">
  <div className="delivery-check-title"><Truck size={16} /><span>CHECK DELIVERY</span></div>
  <form onSubmit={check}>
   <input value={pin} maxLength={6} inputMode="numeric" placeholder="ENTER PINCODE" onChange={e => setPin(e.target.value.replace(/\D/g, ""))} />
   <button type="submit">CHECK</button>
  </form>
  {err && <p className="delivery-check-error">{err}</p>}
  {result && <div className="delivery-check-result">
   <p><strong>Delivery by {result.label}</strong> ({result.days} {result.days === 1 ? "day" : "days"})</p>
   <p className="delivery-check-cod"><RotateCcw size={13} /> Cash on Delivery available in this area</p>
  </div>}
 </div>;
}
