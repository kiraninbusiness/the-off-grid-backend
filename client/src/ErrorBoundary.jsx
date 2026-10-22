import React from "react";

/*
  Without this, ANY uncaught error during render — anywhere in the
  app, not just one page — unmounts the entire React tree and leaves
  a blank white screen with no indication anything went wrong. This
  catches that case and shows a real message with a way to recover,
  instead of a dead page that looks like the site is broken.
*/
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "16px",
          padding: "40px", textAlign: "center", fontFamily: "sans-serif",
          background: "#0a0a0a", color: "#f2f0ea",
        }}>
          <h1 style={{ fontSize: "20px", letterSpacing: "1px" }}>SOMETHING WENT WRONG.</h1>
          <p style={{ color: "#999", maxWidth: "400px" }}>
            This page hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#f2f0ea", color: "#0a0a0a", border: "none",
              padding: "12px 24px", fontSize: "11px", letterSpacing: "1px",
              cursor: "pointer",
            }}
          >
            RELOAD PAGE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
