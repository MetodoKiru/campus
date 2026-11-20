"use client";

import { useState } from "react";
import { FileText, FolderOpen } from "lucide-react";
import { card, subtle } from "@/components/classes/shared";
import type { FamilyInfoView } from "@/lib/incorporacion";
import { useFamilyApi } from "./api";

/**
 * Coordinación y administración: lo que han mandado las familias en el paso 3 de sus
 * primeros pasos (contactos del colegio, psicólogo… y archivos). Solo lectura.
 * Los archivos están en Jotform: se abren con la sesión de Jotform de Método Kiru.
 */
export default function StaffFamilyInfo() {
  const { data, error } = useFamilyApi<{ items: FamilyInfoView[] }>("/api/familias/incorporacion");
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <section className={`${card} space-y-1`}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-[#292825]"><FolderOpen className="h-5 w-5" /> Información de las familias</h2>
        <p className="text-xs leading-relaxed text-[#77736B]">
          Contactos del colegio, del psicólogo u otros profesionales y los archivos que nos han dejado las familias (informes, notas, certificados…).
          Es voluntario. Antes de contactar con alguien, mirad si la familia lo ha autorizado.
        </p>
      </section>
      {error && <p className="text-xs text-[#9A4B3F]">{error}</p>}
      {!data && !error && <p className="text-xs text-[#77736B]">Cargando…</p>}
      {data && items.length === 0 && <p className={`${card} text-xs text-[#77736B]`}>Todavía ninguna familia ha enviado información.</p>}
      {items.map((it) => (
        <section key={it.id} className={`${card} space-y-3`}>
          <button type="button" onClick={() => setOpenId(openId === it.id ? null : it.id)} className="flex w-full items-start justify-between gap-3 text-left">
            <span>
              <span className="block font-serif text-base font-bold text-[#292825]">{it.studentName}</span>
              <span className="block text-[11px] text-[#77736B]">
                {new Date(it.receivedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                {it.files.length ? ` · ${it.files.length} archivo${it.files.length > 1 ? "s" : ""}` : ""}
                {it.email ? ` · ${it.email}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-[#806C50]">{openId === it.id ? "Cerrar" : "Ver"}</span>
          </button>
          {openId === it.id && (
            <div className="space-y-3">
              {it.answers.length > 0 && (
                <dl className={`${subtle} grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[minmax(0,14rem)_1fr]`}>
                  {it.answers.map((a, i) => (
                    <div key={`${a.label}-${i}`} className="contents">
                      <dt className="text-[#77736B]">{a.label}</dt>
                      <dd className="whitespace-pre-wrap font-medium text-[#292825]">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {it.files.length > 0 && (
                <ul className="space-y-1.5">
                  {it.files.map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#45433F] underline">
                        <FileText className="h-3.5 w-3.5" /> {f.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
