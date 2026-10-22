const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// A 401 means the stored token is missing/invalid/expired — every
// authenticated call was failing silently (or, worse, crashing a page
// that didn't handle the resulting error state safely) and leaving
// someone staring at a wall of failed requests with no indication
// they just needed to log back in. Clear the stale session and send
// them to sign in, once, instead of that.
let redirectingToLogin = false;
function handleUnauthorized() {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  localStorage.removeItem("offgrid_user");
  localStorage.removeItem("offgrid_token");
  if (!window.location.pathname.startsWith("/account")) {
    window.location.href = "/account?session=expired";
  }
}

export async function api(path, options = {}) {
  const token = localStorage.getItem("offgrid_token");
  const headers = { ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers||{}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {...options, headers});
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    handleUnauthorized();
  }
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// File uploads use multipart/form-data — the browser sets its own
// Content-Type with a boundary, so this deliberately skips the JSON
// header api() adds above.
export async function apiUpload(file) {
  const token = localStorage.getItem("offgrid_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Upload failed");
  return data;
}
