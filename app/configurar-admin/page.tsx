"use client";

import { useState } from "react";
import Link from "next/link";

export default function ConfigurarAdminPage() {
  const [secret, setSecret] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("admin");
  const [email, setEmail] = useState("m.sofiamunoz05@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kiru-bootstrap-secret": secret },
        body: JSON.stringify({ fullName, username, email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo crear el administrador.");
      setMessage({ error: false, text: result.message });
      setSecret(""); setPassword("");
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Error inesperado." });
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#F3EFE6] px-4 py-12 text-[#292D27]"><section className="mx-auto max-w-lg rounded-3xl border border-[#E5DED0] bg-[#FBF9F4] p-7 shadow-xl sm:p-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-800">Método Kiru · Configuración inicial</p><h1 className="mt-3 text-2xl font-bold">Crear cuenta administradora</h1><p className="mt-3 text-sm leading-6 text-slate-600">Solo funciona si no existe ningún administrador. Configura primero KIRU_BOOTSTRAP_SECRET en las variables de entorno de Vercel. Usa un código aleatorio largo y no lo compartas.</p>
  {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${message.error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}
  <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium">Código de configuración<input required type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-sm font-medium">Nombre completo<input required value={fullName} onChange={e=>setFullName(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-sm font-medium">Nombre de usuario<input required pattern="[a-zA-Z0-9._-]{3,40}" value={username} onChange={e=>setUsername(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="block text-sm font-medium">Contraseña (mínimo 12 caracteres)<input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><button disabled={busy} className="w-full rounded-xl bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Creando cuenta…" : "Crear administrador"}</button></form><Link href="/" className="mt-5 inline-block text-sm text-emerald-800 underline">Volver al acceso</Link></section></main>;
}
