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
    <main className="min-h-screen bg-[#F3EFE6] px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver a administración
        </Link>
        <header className="mt-6 rounded-3xl border border-[#E5DED0] bg-[#FBF9F4] p-7 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-800">Método Kiru · Campus</p>
          <h1 className="mt-3 font-serif text-3xl font-bold">Previsualización del campus</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Accesos rápidos para revisar el diseño de cada área. Esta vista no inicia sesión como otro usuario ni crea datos; la información real solo aparecerá cuando las cuentas y sus relaciones estén configuradas.
          </p>
        </header>
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {views.map(({ title, description, href, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900"><Icon className="h-5 w-5" /></div>
              <h2 className="mt-4 text-lg font-bold group-hover:text-emerald-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-emerald-800">Abrir vista →</span>
            </Link>
          ))}
        </section>
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Importante: los usuarios que comentaste todavía no están creados en Supabase. He comprobado la base de datos y actualmente hay 0 cuentas y 0 relaciones; por eso no puedo decir que ya puedan entrar.
        </p>
      </div>
    </main>
  );
}
