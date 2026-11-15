"use client";

import {
  AlertTriangle, Bell, CalendarDays, CalendarOff, ClipboardCheck, ClipboardList,
  Coins, Compass, CreditCard, Eye, FileText, Gauge, GraduationCap, ShieldCheck, Sprout, UserCheck, Users, Wallet,
} from "lucide-react";
import SideMenu, { type SideMenuGroup, type SideMenuItem } from "@/components/nav/SideMenu";

export type AdminSection =
  | "usuarios" | "alumnos" | "documentos" | "pagos" | "avisos" | "evaluaciones" | "skillcoins"
  | "propuestas" | "incorporacion" | "pagos-mentores" | "crece"
  | "dias-sin-clase" | "periodos-especiales" | "horarios" | "desempeno";

export const ADMIN_SECTIONS: AdminSection[] = [
  "usuarios", "alumnos", "documentos", "pagos", "avisos", "evaluaciones", "skillcoins",
  "propuestas", "incorporacion", "pagos-mentores", "crece", "dias-sin-clase", "periodos-especiales", "horarios", "desempeno",
];

type Item = SideMenuItem<AdminSection>;
type Group = SideMenuGroup<AdminSection>;

/**
 * Menú del panel de administración, agrupado por lo que quieres hacer.
 * Las secciones se abren dentro del panel; los enlaces con «↗» llevan a otro panel
 * (coordinación o formación), donde administración también puede entrar.
 */
const GROUPS: Group[] = [
  {
    id: "personas",
    title: "Personas y cuentas",
    items: [
      { kind: "section", id: "usuarios", label: "Usuarios y enlaces", icon: Users },
      { kind: "link", href: "/coordinador?tab=sin-asignar", label: "Registros sin asignar", icon: AlertTriangle, note: "coordinación" },
    ],
  },
  {
    id: "familias",
    title: "Alumnos y familias",
    items: [
      { kind: "section", id: "alumnos", label: "Mis alumnos (activos y pagos)", icon: GraduationCap },
      { kind: "section", id: "evaluaciones", label: "Evaluaciones (inicial y académica)", icon: ClipboardCheck },
      { kind: "section", id: "documentos", label: "Documentos PDF", icon: FileText },
      { kind: "section", id: "avisos", label: "Avisos", icon: Bell },
      { kind: "section", id: "pagos", label: "Pagos de familias", icon: CreditCard },
      { kind: "section", id: "skillcoins", label: "SkillCoins y recompensas", icon: Coins },
      { kind: "link", href: "/coordinador?tab=informes", label: "Informes de progreso", icon: ClipboardList, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=llamadas", label: "Llamadas semanales con familias", icon: CalendarDays, note: "coordinación" },
    ],
  },
  {
    id: "clases",
    title: "Clases y calendario",
    items: [
      { kind: "link", href: "/coordinador?tab=clases", label: "Clases y recuperaciones", icon: CalendarDays, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=registros", label: "Registros de sesión", icon: ClipboardList, note: "coordinación" },
      { kind: "section", id: "horarios", label: "Cambios de horario y disponibilidad", icon: CalendarDays },
      { kind: "section", id: "dias-sin-clase", label: "Días sin clase", icon: CalendarOff },
      { kind: "section", id: "periodos-especiales", label: "Navidad y Semana Santa", icon: CalendarOff },
    ],
  },
  {
    id: "mentores",
    title: "Mentores",
    items: [
      { kind: "link", href: "/formador", label: "Incorporación de mentores", icon: GraduationCap, note: "formación" },
      { kind: "section", id: "incorporacion", label: "Autorizaciones de mentores", icon: UserCheck },
      { kind: "section", id: "propuestas", label: "Propuestas a mentores", icon: Users },
      { kind: "link", href: "/coordinador?tab=mentores", label: "Seguimiento de mentores", icon: Compass, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=incidencias", label: "Incidencias", icon: AlertTriangle, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=supervision", label: "Supervisión", icon: ClipboardCheck, note: "coordinación" },
      { kind: "link", href: "/coordinador?tab=reuniones", label: "Reuniones de coordinación", icon: CalendarDays, note: "coordinación" },
      { kind: "section", id: "desempeno", label: "Desempeño de mentores", icon: Gauge },
      { kind: "section", id: "pagos-mentores", label: "Pagos de mentores", icon: Wallet },
      { kind: "section", id: "crece", label: "Crece con Kiru", icon: Sprout },
    ],
  },
  {
    id: "revisar",
    title: "Revisar el campus",
    items: [
      { kind: "link", href: "/previsualizacion", label: "Ver el campus como…", icon: Eye },
    ],
  },
];

export const SECTION_LABEL: Record<AdminSection, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.items).filter((i): i is Extract<Item, { kind: "section" }> => i.kind === "section").map((i) => [i.id, i.label]),
) as Record<AdminSection, string>;

export default function AdminSidebar({ active, onSelect }: { active: AdminSection; onSelect: (s: AdminSection) => void }) {
  return <SideMenu groups={GROUPS} active={active} onSelect={onSelect} storageKey="kiru_admin_sidebar" title="Administración" titleIcon={ShieldCheck} />;
}
