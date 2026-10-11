"use client";

import { TextareaHTMLAttributes, useEffect, useLayoutEffect, useRef } from "react";

export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isComposing = useRef(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    function resize() {
      if (!element) return;
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
      if (!isComposing.current) element.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
    resize();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) { width = entry.contentRect.width; resize(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = () => { isComposing.current = true; };
    const end = () => { isComposing.current = false; };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    return () => { el.removeEventListener("compositionstart", start); el.removeEventListener("compositionend", end); };
  }, []);
  return <textarea {...props} ref={ref} />;
}