"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  category: "mentor" | "desarrollo";
  role: string;
  experience: string[];
  availability?: string;
  location?: string;
  bio: string;
  photoUrl: string;
}

const TEAM_MEMBERS: TeamMember[] = [
  // Categoría: Mentores
  {
    id: "1",
    name: "Sofía Muñoz",
    category: "mentor",
    role: "Mentora Pedagógica",
    experience: ["TDAH / AACC", "Técnicas de estudio", "Matemáticas", "Inglés"],
    availability: "Lunes a Jueves (Tardes)",
    location: "Pozuelo, Aravaca y Valdemarín",
    bio: "Graduada en Psicología con especialización educativa. Acompaño a alumnos en el desarrollo de su autonomía y metodologías de estudio personalizadas.",
    photoUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: "2",
    name: "Alejandro Ruiz",
    category: "mentor",
    role: "Mentor Académico",
    experience: ["ESO / Bachillerato", "Física y Química", "Organización"],
    availability: "Tardes y mañanas de fin de semana",
    location: "Chamberí y Madrid Noroeste",
    bio: "Estudiante de Ingeniería y mentor educativo con más de 3 años de experiencia en apoyo escolar y refuerzo motivacional.",
    photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80"
  },
  // Categoría: Desarrollo Método Kiru
  {
    id: "3",
    name: "M. Sofía Muñoz",
    category: "desarrollo",
    role: "Fundadora & Dirección",
    experience: ["Pedagogía activa", "Dirección de programas", "Atención a familias"],
    bio: "Fundadora de Método Kiru. Diseño y superviso los planes educativos y el acompañamiento estratégico de cada familia.",
    photoUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: "4",
    name: "Silvia",
    category: "desarrollo",
    role: "Proveedora Tecnológica",
    experience: ["Desarrollo web", "Campus Virtual", "Next.js & Arquitectura"],
    bio: "Responsable técnica de la infraestructura digital, diseño del campus educativo y herramientas de aprendizaje interactivo.",
    photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80"
  }
];

export default function EquipoPage() {
  const [filter, setFilter] = useState<"todos" | "mentor" | "desarrollo">("todos");

  const mentores = TEAM_MEMBERS.filter((m) => m.category === "mentor");
  const desarrollo = TEAM_MEMBERS.filter((m) => m.category === "desarrollo");

  const whatsappLink = "https://wa.me/34651382833?text=Hola,%20me%20gustar%C3%ADa%20m%C3%A1s%20informaci%C3%B3n%20sobre%20M%C3%A9todo%20Kiru";

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1E293B] font-sans pb-16">
      {/* Barra de navegación superior limpia */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-serif text-lg sm:text-xl text-slate-900 font-bold">Método Kiru</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Conoce al equipo</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
            <span>Contacto</span>
          </a>

          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-300 transition shadow-sm"
          >
            Plataforma Kiru
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Título principal exacto según feedback */}
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-serif text-slate-900 font-bold">Conoce al equipo</h2>
        </div>

        {/* Selector de categoría */}
        <div className="flex justify-center">
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex gap-1 text-xs font-semibold">
            {[
              { id: "todos", label: "Todo el Equipo" },
              { id: "mentor", label: "Mentores" },
              { id: "desarrollo", label: "Desarrollo Método Kiru" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as typeof filter)}
                className={`px-4 py-2 rounded-xl transition ${
                  filter === tab.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECCIÓN 1: MENTORES (Sin icono, título limpio) */}
        {(filter === "todos" || filter === "mentor") && (
          <section className="space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-serif text-xl text-slate-900 font-bold">Mentores</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mentores.map((m) => (
                <div
                  key={m.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <img
                        src={m.photoUrl}
                        alt={m.name}
                        className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
                      />
                      <div>
                        <h4 className="font-serif text-lg text-slate-900 font-bold">{m.name}</h4>
                        <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 inline-block">
                          {m.role}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {m.bio}
                    </p>

                    <div className="space-y-1 pt-1 text-[11px] text-slate-500">
                      {m.availability && (
                        <p><strong>Disponibilidad:</strong> {m.availability}</p>
                      )}
                      {m.location && (
                        <p><strong>Zonas:</strong> {m.location}</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                      Áreas de experiencia:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {m.experience.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-[#FAF8F5] border border-slate-200 text-slate-700 text-[10px] font-medium rounded-lg"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECCIÓN 2: DESARROLLO MÉTODO KIRU (Sin icono, título limpio) */}
        {(filter === "todos" || filter === "desarrollo") && (
          <section className="space-y-4 pt-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="font-serif text-xl text-slate-900 font-bold">Desarrollo Método Kiru</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {desarrollo.map((m) => (
                <div
                  key={m.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <img
                        src={m.photoUrl}
                        alt={m.name}
                        className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
                      />
                      <div>
                        <h4 className="font-serif text-lg text-slate-900 font-bold">{m.name}</h4>
                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 inline-block">
                          {m.role}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {m.bio}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex flex-wrap gap-1.5">
                      {m.experience.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-[#FAF8F5] border border-slate-200 text-slate-700 text-[10px] font-medium rounded-lg"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}