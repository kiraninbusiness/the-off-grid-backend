const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

/*
  RULE-BASED SIZE FINDER

  This is a straightforward lookup table, not a trained model — it's
  labeled as "general guidance" everywhere it's shown rather than
  framed as precise AI sizing, since a height/weight/fit heuristic is
  necessarily approximate. Still meaningfully more useful than a bare
  size chart for someone unsure where to start.
*/
function baseSizeFromWeight(weightKg) {
  if (weightKg <= 55) return "S";
  if (weightKg <= 65) return "M";
  if (weightKg <= 75) return "L";
  if (weightKg <= 85) return "XL";
  return "XXL";
}

function shiftSize(size, steps) {
  const idx = SIZE_ORDER.indexOf(size);
  if (idx === -1) return size;
  const next = Math.min(SIZE_ORDER.length - 1, Math.max(0, idx + steps));
  return SIZE_ORDER[next];
}

export function recommendSize({ heightCm, weightKg, fit = "regular" }, availableSizes = []) {
  let size = baseSizeFromWeight(Number(weightKg));

  // Height adjustment — a taller or shorter frame shifts the band
  if (Number(heightCm) >= 183) size = shiftSize(size, 1);
  else if (Number(heightCm) <= 160) size = shiftSize(size, -1);

  // Fit preference adjustment
  if (fit === "slim") size = shiftSize(size, -1);
  if (fit === "oversized") size = shiftSize(size, 1);

  // Snap to whatever sizes this specific product actually offers
  if (availableSizes.length) {
    const normalized = availableSizes.map((s) => s.trim().toUpperCase());
    if (normalized.includes(size)) return size;

    // Find the nearest available size in the standard order
    const targetIdx = SIZE_ORDER.indexOf(size);
    let best = normalized[0];
    let bestDist = Infinity;
    for (const s of normalized) {
      const idx = SIZE_ORDER.indexOf(s);
      if (idx === -1) continue;
      const dist = Math.abs(idx - targetIdx);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    return best;
  }

  return size;
}
