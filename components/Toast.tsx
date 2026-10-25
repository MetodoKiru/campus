"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

type ToastProps = {
  text: string;
  type?: "success" | "error";
  onClose: () => void;
};

/**
 * Aviso flotante abajo de la pantalla: se ve aunque estés al final de la página.
 * Los avisos de éxito se cierran solos; los de error se quedan hasta cerrarlos.
 */
export default function Toast({ text, type = "success", onClose }: ToastProps) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (type === "error") return;
    const timer = setTimeout(() => closeRef.current(), 5000);
    return () => clearTimeout(timer);
  }, [text, type]);

  const isError = type === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-full sm:max-w-md z-50 p-4 rounded-2xl border shadow-lg text-sm font-medium flex items-start gap-3 ${
        isError ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
      }`}
    >
      {isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="shrink-0 opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
