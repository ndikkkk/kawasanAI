"use client";

import { useLayoutEffect, useRef, useState } from "react";

export default function useChatScroll(conversationId?: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);

  function latest() {
    following.current = true;
    setAway(false);
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function onScroll() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    setAway(!following.current);
  }

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    latest();
    // Also follow streamed Markdown, font/image loads and composer/viewport resizing.
    const observer = new ResizeObserver(() => {
      if (following.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, [conversationId]);

  return { scrollRef, contentRef, away, latest, onScroll };
}