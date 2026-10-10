"use client";

import { TextareaHTMLAttributes, useLayoutEffect, useRef } from "react";

export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    function resize() {
      if (!element) return;
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
    resize();
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) { width = entry.contentRect.width; resize(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.value]);
  return <textarea {...props} ref={ref} />;
}