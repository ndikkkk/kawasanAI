"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      let saved: string | null = null;
      try { saved = localStorage.getItem("kawasan-ai-theme"); } catch {}
      const next = saved === "dark" || (saved !== "light" && media.matches);
      document.documentElement.dataset.theme = next ? "dark" : "light";
      setDark(next);
    }
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
    try { localStorage.setItem("kawasan-ai-theme", next ? "dark" : "light"); } catch {}
  }
  return <button className="theme-toggle" onClick={toggle} aria-label={dark ? "Gunakan tema terang" : "Gunakan tema gelap"} title={dark ? "Gunakan tema terang" : "Gunakan tema gelap"}><span aria-hidden="true">{dark ? "☀" : "☾"}</span><span>{dark ? "Terang" : "Gelap"}</span></button>;
}