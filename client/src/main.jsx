import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode><ErrorBoundary><BrowserRouter><App /></BrowserRouter></ErrorBoundary></React.StrictMode>
);

/*
  FIX: manifest.json + sw.js + icons were all present (the pieces
  needed for "Add to Home Screen" / installable PWA support) but
  the service worker was never registered anywhere, so none of it
  actually did anything.
*/
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
