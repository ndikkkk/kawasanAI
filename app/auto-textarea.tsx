"use client";

import { TextareaHTMLAttributes, useLayoutEffect, useRef } from "react";

export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    function resize() {
      if (!element) return;
      const scrollY = window.scrollY;
      const prevHeight = element.style.height;
      element.style.height = "auto";
      const newHeight = `${element.scrollHeight}px`;
      element.style.height = newHeight;
      // Restore scroll position — height reset above can cause page to jump.
      if (prevHeight !== newHeight) window.scrollTo(0, scrollY);
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