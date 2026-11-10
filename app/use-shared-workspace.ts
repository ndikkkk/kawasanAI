"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { Workspace, newWorkspace } from "../lib/chat-store";
import { validConversations } from "../lib/shared-history";
import type { Confirm } from "./use-confirmation";

const PREFERENCES_KEY = "kawasan-ai-preferences";
const WORKSPACE_KEY = "kawasan-ai-workspace";

export default function useSharedWorkspace(busy: boolean, confirm: Confirm) {
  const [workspace, render] = useState<Workspace | null>(null);
  const current = useRef<Workspace | null>(null);
  const dirty = useRef(false);
  const working = useRef(false);
  const blocked = useRef(false);
  const preferencesWritable = useRef(true);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const alive = useRef(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const [pending, setPending] = useState(false);

  const setWorkspace: Dispatch<SetStateAction<Workspace | null>> = useCallback((action) => {
    const previous = current.current;
    const next = typeof action === "function" ? action(previous) : action;
    if (previous && next && previous.conversations !== next.conversations) {
      dirty.current = true;
      setPending(true);
    }
    current.current = next;
    render(next);
  }, []);

  const load = useCallback(async (force = false) => {
    if (working.current || busyRef.current || (!force && (dirty.current || blocked.current))) return;
    working.current = true;
    const initialConversations = current.current?.conversations;
    try {
      let savedWorkspace: Workspace | null = null;
      try {
        const raw = localStorage.getItem(WORKSPACE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (!parsed || !validConversations(parsed.conversations) || typeof parsed.activeId !== "string") throw new Error();
          savedWorkspace = parsed as Workspace;
        }
      } catch { throw new Error("Riwayat lokal tidak valid atau tidak dapat dibaca; data tidak ditimpa."); }
      if (!alive.current || busyRef.current || initialConversations !== current.current?.conversations || (!force && dirty.current)) return;
      let previous = current.current;
      if (!previous) {
        previous = newWorkspace();
        try {
          const raw = localStorage.getItem(PREFERENCES_KEY);
          if (raw) {
            const preferences = JSON.parse(raw);
            if (typeof preferences.name !== "string" || typeof preferences.instructions !== "string") throw new Error();
            previous.preferences = { name: preferences.name.slice(0, 60), instructions: preferences.instructions };
            previous.collapsed = preferences.collapsed === true;
          }
        } catch {
          preferencesWritable.current = false;
          setPreferenceError("Preferensi lokal tidak dapat dibaca; data lama tidak ditimpa.");
        }
      }
      const source = savedWorkspace || previous;
      const conversations = source.conversations.length ? source.conversations : newWorkspace().conversations;
      const next = { ...previous, ...source, conversations, activeId: conversations.some((chat) => chat.id === source.activeId) ? source.activeId : conversations[0].id };
      current.current = next;
      render(next);
      dirty.current = false;
      blocked.current = false;
      setPending(false);
      setStorageError("");
    } catch (reason) {
      if (alive.current) setStorageError(reason instanceof Error ? reason.message : "Gagal memuat riwayat lokal.");
    } finally { working.current = false; }
  }, []);

  const save = useCallback(async () => {
    if (working.current || busyRef.current || !dirty.current || !current.current) return;
    const conversations = current.current.conversations;
    working.current = true;
    setSaving(true);
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(current.current));
      if (!alive.current) return;
      dirty.current = current.current?.conversations !== conversations;
      blocked.current = false;
      setPending(dirty.current);
      setStorageError("");
    } catch (reason) {
      blocked.current = true;
      if (alive.current) setStorageError(reason instanceof Error ? reason.message : "Gagal menyimpan riwayat lokal.");
    } finally { working.current = false; if (alive.current) setSaving(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (dirty.current && !blocked.current) void save();
      else void load();
    }, 10000);
    function warn(event: BeforeUnloadEvent) {
      if (dirty.current || busyRef.current) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", warn);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener("beforeunload", warn); };
  }, [load, save]);

  useEffect(() => {
    if (!workspace || busy || blocked.current || !dirty.current) return;
    const timer = window.setTimeout(() => void save(), 600);
    return () => window.clearTimeout(timer);
  }, [workspace, busy, save]);

  useEffect(() => {
    if (!workspace || !preferencesWritable.current) return;
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...workspace.preferences, collapsed: workspace.collapsed }));
      setPreferenceError("");
    } catch { setPreferenceError("Preferensi tidak tersimpan karena penyimpanan browser diblokir/penuh."); }
  }, [workspace?.preferences, workspace?.collapsed]);

  function exportHistory() {
    if (!current.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "kawasan-ai-history.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function reload() {
    if (dirty.current && !await confirm({ title: "Muat ulang riwayat?", description: "Perubahan lokal yang belum tersimpan akan diganti dengan riwayat browser tersimpan. Ekspor cadangan dulu jika masih diperlukan.", label: "Muat ulang", danger: true })) return;
    await load(true);
  }

  return { workspace, setWorkspace, storageError: storageError || preferenceError, saving, pending, save, reload, exportHistory };
}