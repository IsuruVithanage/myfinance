"use client";

import { useEffect } from "react";

/** Registers the offline shell worker. Silent by design — no install nags. */
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* an unavailable worker must never break the app */
      });
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
