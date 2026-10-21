"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, GraduationCap, Users, ShieldCheck } from "lucide-react";

const views = [
  { title: "Vista del alumno", description: "Área de aprendizaje, actividades y progreso.", href: "/alumno", icon: GraduationCap },
  { title: "Vista del mentor", description: "Área de seguimiento de alumnos y sesiones.", href: "/mentor", icon: BookOpen },
  { title: "Vista de familia", description: "Seguimiento familiar, documentos y pagos.", href: "/padre", icon: Users },
  { title: "Administración", description: "Volver al panel de gestión del campus.", href: "/admin", icon: ShieldCheck },
];

export default function PrevisualizacionPage() {
  return (
    <main className="min-h-screen bg-[#F7F6F3] px-4 py-10 text-[#343330] sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#343330] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver a administración
        </Link>
        <header className="mt-6 rounded-3xl border border-[#E7E3DC] bg-white p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#77736B]">Método Kiru · Campus</p>
          <h1 className="mt-3 font-serif text-3xl font-bold">Previsualización del campus</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#77736B]">
            Accesos rápidos para revisar el diseño de cada área. Esta vista no inicia sesión como otro usuario ni crea datos; la información real solo aparecerá cuando las cuentas y sus relaciones estén configuradas.
          </p>
        </header>
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {views.map(({ title, description, href, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-[#E7E3DC] bg-white p-6 shadow-xs transition hover:border-[#CFC8BC] hover:shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900"><Icon className="h-5 w-5" /></div>
              <h2 className="mt-4 text-lg font-bold group-hover:text-emerald-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-[#77736B]">Abrir vista →</span>
            </Link>
          ))}
        </section>
        <p className="mt-6 rounded-xl border border-[#E7E3DC] bg-[#F7F5F1] p-4 text-sm leading-6 text-[#6D6962]">
          Importante: los usuarios que comentaste todavía no están creados en Supabase. He comprobado la base de datos y actualmente hay 0 cuentas y 0 relaciones; por eso no puedo decir que ya puedan entrar.
        </p>
      </div>
    </main>
  );
}
