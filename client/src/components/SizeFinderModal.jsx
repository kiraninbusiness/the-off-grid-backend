import React, { useState } from "react";
import { X } from "lucide-react";
import { recommendSize } from "../utils/sizeFinder";

export default function SizeFinderModal({ onClose, sizes = [], onSelect }) {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [fit, setFit] = useState("regular");
  const [result, setResult] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!height || !weight) return;
    const size = recommendSize({ heightCm: Number(height), weightKg: Number(weight), fit }, sizes);
    setResult(size);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="size-modal size-finder-modal">
        <button className="modal-x" onClick={onClose}><X size={20} /></button>
        <h3>FIND MY SIZE</h3>
        <p className="size-finder-disclaimer">General guidance based on typical fits — always check the size guide for exact measurements.</p>

        {!result ? (
          <form onSubmit={submit} className="size-finder-form">
            <label>HEIGHT (CM)<input required type="number" min="120" max="220" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
            <label>WEIGHT (KG)<input required type="number" min="30" max="180" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
            <label>FIT PREFERENCE
              <div className="size-finder-fit-options">
                {["slim", "regular", "oversized"].map((f) => (
                  <button type="button" key={f} className={fit === f ? "active" : ""} onClick={() => setFit(f)}>{f.toUpperCase()}</button>
                ))}
              </div>
            </label>
            <button className="orange-btn" type="submit">FIND MY SIZE</button>
          </form>
        ) : (
          <div className="size-finder-result">
            <span>RECOMMENDED SIZE</span>
            <strong>{result}</strong>
            <p>{fit === "regular" ? "Regular" : fit.charAt(0).toUpperCase() + fit.slice(1)} fit — {result} should give you the intended silhouette.</p>
            <div>
              <button className="orange-btn" onClick={() => onSelect(result)}>SELECT SIZE {result}</button>
              <button className="text-button" onClick={() => setResult(null)}>TRY AGAIN</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
