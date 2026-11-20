"use client";

import { useEffect, useState } from "react";
import { STATUS_LABEL, type StepStatus } from "@/lib/mentor-steps";

type ActiveMentor = {
  id: string;
  fullName: string;
  username: string | null;
  students: number;
  steps: Record<string, StepStatus>;
  confidentialitySignedAt: string | null;
  certificateCheckedAt: string | null;
  lastOffer: { response: "si" | "ajustar" | "no" | null; respondedAt: string | null; sentAt: string | null } | null;
  specialties: string[];
  accreditedHours: number | null;
};

const OFFER_LABEL = { si: "Aceptó", ajustar: "Pidió ajustar", no: "No puede" } as const;
const fmt = (v: string | null) => (v ? new Date(v).toLocaleDateString("es-ES") : "");

/** Supervisión de mentores activos: pasos, certificado, alumnos y disponibilidad (última oferta). */
export default function ActiveMentors({ api }: { api: (path: string) => Promise<{ mentors?: ActiveMentor[] }> }) {
  const [mentors, setMentors] = useState<ActiveMentor[]>([]);
  const [error, setError] = useState("");
  const [soloSinAlumnos, setSoloSinAlumnos] = useState(false);

  useEffect(() => {
    let alive = true;
    api("/api/formador/activos")
      .then((r) => { if (alive) setMentors(Array.isArray(r.mentors) ? r.mentors : []); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "No se pudieron cargar los mentores activos."); });
    return () => { alive = false; };
  }, [api]);

  const visibles = soloSinAlumnos ? mentors.filter((m) => m.students === 0) : mentors;
  const sinAlumnos = mentors.filter((m) => m.students === 0).length;
  const step = (m: ActiveMentor, key: string) => (m.steps[key] ? STATUS_LABEL[m.steps[key]] : "Pendiente");

  return (
    <section className="bg-white rounded-3xl border border-[#E7E3DC] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-bold text-slate-900">Mentores activos ({mentors.length})</h2>
        <label className="text-xs text-slate-600 flex items-center gap-2">
          <input type="checkbox" checked={soloSinAlumnos} onChange={(e) => setSoloSinAlumnos(e.target.checked)} />
          Solo sin alumnos ({sinAlumnos})
        </label>
      </div>
      <p className="text-xs text-slate-500 mt-1">Solo ves cuántos alumnos tiene cada mentor, no sus datos. Las especialidades se validan en la hoja «Solicitud mentores» → «Acreditaciones Tipo A» y aparecen aquí solas. «Última oferta» indica su disponibilidad para nuevas asignaciones.</p>
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-3">Mentor</th><th className="py-2 pr-3">Alumnos</th><th className="py-2 pr-3">Especialidades</th><th className="py-2 pr-3">Certificado delitos</th>
              <th className="py-2 pr-3">«Nuestro Equipo»</th><th className="py-2 pr-3">Confidencialidad</th><th className="py-2">Última oferta</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-semibold text-slate-800">{m.fullName}<span className="block font-normal text-slate-400">{m.username}</span></td>
                <td className={`py-2 pr-3 ${m.students === 0 ? "text-amber-700 font-semibold" : ""}`}>{m.students === 0 ? "Sin alumnos" : m.students}</td>
                <td className="py-2 pr-3">{m.specialties.length ? `${m.specialties.join(", ")}${m.accreditedHours ? ` (${m.accreditedHours} h)` : ""}` : "—"}</td>
                <td className="py-2 pr-3">{m.certificateCheckedAt ? `Comprobado ${fmt(m.certificateCheckedAt)}` : step(m, "certificado")}</td>
                <td className="py-2 pr-3">{step(m, "nuestro_equipo")}</td>
                <td className="py-2 pr-3">{m.confidentialitySignedAt ? fmt(m.confidentialitySignedAt) : "—"}</td>
                <td className="py-2">{m.lastOffer ? (m.lastOffer.response ? `${OFFER_LABEL[m.lastOffer.response]} ${fmt(m.lastOffer.respondedAt)}` : `Sin respuesta (enviada ${fmt(m.lastOffer.sentAt)})`) : "Ninguna"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
