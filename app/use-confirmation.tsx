"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Confirmation = { title: string; description: string; label: string; danger?: boolean };
export type Confirm = (options: Confirmation) => Promise<boolean>;

export function ConfirmationDialog({ options, onAnswer }: { options: Confirmation; onAnswer: (answer: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="settings-dialog confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" onCancel={(event) => { event.preventDefault(); onAnswer(false); }}>
    <div className={`confirmation-mark ${options.danger ? "is-danger" : ""}`} aria-hidden="true">{options.danger ? "×" : "↻"}</div>
    <h2 id="confirmation-title">{options.title}</h2>
    <p id="confirmation-description">{options.description}</p>
    <div className="dialog-actions"><button autoFocus onClick={() => onAnswer(false)}>Batal</button><button className={options.danger ? "danger-button" : "primary-button"} onClick={() => onAnswer(true)}>{options.label}</button></div>
  </dialog>;
}

export default function useConfirmation() {
  const [options, setOptions] = useState<Confirmation | null>(null);
  const resolve = useRef<((answer: boolean) => void) | null>(null);
  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);
  const confirm: Confirm = useCallback((value) => {
    if (resolve.current) return Promise.resolve(false);
    return new Promise<boolean>((answer) => { resolve.current = answer; setOptions(value); });
  }, []);
  function onAnswer(answer: boolean) {
    const finish = resolve.current;
    resolve.current = null;
    setOptions(null);
    finish?.(answer);
  }
  return { confirm, confirmationDialog: options && <ConfirmationDialog options={options} onAnswer={onAnswer} /> };
}