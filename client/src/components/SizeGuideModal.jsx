import React, { useState } from "react";
import { X, Ruler } from "lucide-react";

const cmToIn = (cm) => (cm == null ? "—" : `${(cm / 2.54).toFixed(1)}"`);

export default function SizeGuideModal({ onClose, product }) {
  const [unit, setUnit] = useState("cm");
  const category = String(product?.category || "").toUpperCase();
  const isBottom = ["BOTTOMS", "FOOTWEAR"].includes(category);
  const customChart = Array.isArray(product?.size_chart) && product.size_chart.length ? product.size_chart : null;

  // Generic fallback for products without a custom chart — unchanged
  // from before, still inches-only since there's no cm source for it.
  const fallbackRows = isBottom
    ? [["28", "28\"", "—", "—"], ["30", "30\"", "—", "—"], ["32", "32\"", "—", "—"], ["34", "34\"", "—", "—"], ["36", "36\"", "—", "—"]]
    : [["S", "36\"", "27\"", "17\""], ["M", "39\"", "28\"", "18\""], ["L", "42\"", "29\"", "19\""], ["XL", "45\"", "30\"", "20\""]];

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="size-modal size-guide-premium">
        <button className="modal-x" onClick={onClose}><X /></button>
        <span><Ruler size={13} /> THE OFF GRID / GUIDE</span>
        <h2>FIND YOUR <em>FIT.</em></h2>
        <p className="size-guide-product">{product?.name}</p>

        {customChart && (
          <div className="size-guide-unit-toggle">
            <button type="button" className={unit === "cm" ? "active" : ""} onClick={() => setUnit("cm")}>CM</button>
            <button type="button" className={unit === "in" ? "active" : ""} onClick={() => setUnit("in")}>INCHES</button>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>SIZE</th>
              <th>{isBottom ? "WAIST" : "CHEST"}</th>
              <th>{isBottom ? "INSEAM" : "LENGTH"}</th>
              <th>{isBottom ? "—" : "SHOULDER"}</th>
            </tr>
          </thead>
          <tbody>
            {customChart
              ? customChart.map((row) => (
                <tr key={row.size}>
                  <td>{row.size}</td>
                  <td>{unit === "cm" ? `${row.chest_cm} cm` : cmToIn(row.chest_cm)}</td>
                  <td>{unit === "cm" ? `${row.length_cm} cm` : cmToIn(row.length_cm)}</td>
                  <td>{row.shoulder_cm != null ? (unit === "cm" ? `${row.shoulder_cm} cm` : cmToIn(row.shoulder_cm)) : "—"}</td>
                </tr>
              ))
              : fallbackRows.map((r) => (
                <tr key={r[0]}>{r.map((x, i) => <td key={i}>{x}</td>)}</tr>
              ))}
          </tbody>
        </table>

        <p>Measurements are a general reference and can vary slightly by garment. If you prefer a relaxed streetwear look, consider sizing up.</p>
      </div>
    </div>
  );
}
