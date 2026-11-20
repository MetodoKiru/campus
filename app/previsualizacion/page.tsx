"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Compass, Eye, GraduationCap, ShieldCheck, Users } from "lucide-react";
import type { PreviewRole } from "@/lib/preview";

const views: { role: PreviewRole; title: string; description: string; href: string; icon: React.ElementType }[] = [
  { role: "alumno", title: "Alumno", description: "Inicio, tareas, flashcards, asignaturas, Calcúlalo, inglés, lengua, progreso y tienda de SkillCoins.", href: "/alumno", icon: GraduationCap },
  { role: "padre", title: "Familia", description: "Seguimiento del hijo o hija, documentos, avisos, pagos, clases y evaluaciones.", href: "/padre", icon: Users },
  { role: "mentor", title: "Mentor", description: "Sus alumnos, registro de sesiones, clases, SkillCoins, propuestas y pagos.", href: "/mentor", icon: BookOpen },
  { role: "coordinador", title: "Coordinador", description: "Sus mentores, clases y recuperaciones, incidencias, supervisión, evaluaciones e informes.", href: "/coordinador", icon: Compass },
  { role: "formador", title: "Formador", description: "Incorporación de mentores nuevos y mentores activos.", href: "/formador", icon: ShieldCheck },
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
          <h1 className="mt-3 flex items-center gap-2 font-serif text-3xl font-bold"><Eye className="h-7 w-7" /> Ver el campus como…</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#77736B]">
            Elige un tipo de usuario para abrir su panel tal y como lo ve. Es una vista previa: no aparece ningún dato real de
            alumnos, familias ni mentores (las listas salen vacías) y nada de lo que pulses se guarda. Arriba verás una franja
            amarilla para cambiar de tipo de usuario o salir.
          </p>
        </header>
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {views.map(({ role, title, description, href, icon: Icon }) => (
            // Enlace normal (recarga la página) para que la vista previa empiece antes de pedir ningún dato.
            <a key={role} href={`${href}?previa=${role}`} className="group rounded-2xl border border-[#E7E3DC] bg-white p-6 shadow-xs transition hover:border-[#CFC8BC] hover:shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900"><Icon className="h-5 w-5" /></div>
              <h2 className="mt-4 text-lg font-bold group-hover:text-emerald-900">Vista de {title.toLowerCase()}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-[#77736B]">Abrir vista previa →</span>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
