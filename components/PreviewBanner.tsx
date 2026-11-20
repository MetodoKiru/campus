"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, LogOut } from "lucide-react";
import { endPreview, PREVIEW_LABEL, PREVIEW_ROLES, previewRole, type PreviewRole } from "@/lib/preview";

export const PREVIEW_HOME: Record<PreviewRole, string> = {
  alumno: "/alumno",
  padre: "/padre",
  mentor: "/mentor",
  coordinador: "/coordinador",
  formador: "/formador",
};

/** Franja fija arriba mientras administración está en «Ver el campus como…». */
export default function PreviewBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<PreviewRole | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setRole(previewRole()), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!role) return null;

  const exit = () => {
    endPreview();
    setRole(null);
    router.push("/previsualizacion");
  };
  const switchTo = (next: PreviewRole) => {
    // Recarga completa: así el panel nuevo arranca ya con la vista previa puesta.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${PREVIEW_HOME[next]}?previa=${next}`;
  };

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-amber-300 px-4 py-2 text-center text-xs font-semibold text-amber-950 shadow">
      <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" /> Vista previa: así ve el campus {PREVIEW_LABEL[role]}.</span>
      <span className="font-normal">Sin datos reales y nada de lo que pulses se guarda.</span>
      <label className="inline-flex items-center gap-1">
        <span className="font-normal">Cambiar a</span>
        <select value={role} onChange={(e) => switchTo(e.target.value as PreviewRole)} className="rounded-md border border-amber-600/40 bg-amber-100 px-1.5 py-0.5 text-xs font-semibold">
          {PREVIEW_ROLES.map((r) => <option key={r} value={r}>{PREVIEW_LABEL[r]}</option>)}
        </select>
      </label>
      <button type="button" onClick={exit} className="inline-flex items-center gap-1 rounded-md bg-amber-950 px-2.5 py-1 text-[11px] font-bold text-amber-50 hover:bg-amber-900">
        <LogOut className="h-3.5 w-3.5" /> Salir de la vista previa
      </button>
    </div>
  );
}
