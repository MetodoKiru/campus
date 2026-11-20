"use client";

import {
  AlertTriangle, CalendarDays, CalendarOff, ClipboardCheck, ClipboardList, Compass, FolderOpen, Home, MapPin, Phone, ShieldCheck, Sprout, Star, Users,
} from "lucide-react";
import SideMenu, { type SideMenuGroup, type SideMenuItem } from "@/components/nav/SideMenu";

export type CoordinatorTab =
  | "inicio" | "mentores" | "clases" | "incidencias" | "registros" | "sin-asignar" | "propuestas" | "reuniones" | "crece"
  | "informes" | "supervision" | "vacaciones" | "evaluaciones" | "seguimiento" | "disponibilidad" | "llamadas" | "info-familias";

export const COORDINATOR_TABS: CoordinatorTab[] = [
  "inicio", "mentores", "clases", "incidencias", "registros", "sin-asignar", "propuestas", "reuniones", "crece",
  "informes", "supervision", "vacaciones", "evaluaciones", "seguimiento", "disponibilidad", "llamadas", "info-familias",
];

export const COORDINATOR_TAB_LABEL: Record<CoordinatorTab, string> = {
  inicio: "Inicio",
  mentores: "Mis mentores",
  seguimiento: "Seguimiento (herramientas y Cálculalo)",
  supervision: "Supervisión de SkillCoins",
  evaluaciones: "Evaluaciones y valoración de familias",
  disponibilidad: "Disponibilidad de mentores",
  reuniones: "Reuniones de coordinación",
  crece: "Crece con Kiru",
  llamadas: "Llamadas con familias",
  "info-familias": "Información de las familias",
  informes: "Informes de progreso",
  propuestas: "Propuestas de alumnos",
  clases: "Clases y recuperaciones",
  incidencias: "Incidencias",
  registros: "Registros de sesión",
  vacaciones: "Navidad y Semana Santa",
  "sin-asignar": "Registros sin asignar",
};

const section = (id: CoordinatorTab, icon: React.ElementType, extra?: { badge?: number | string; warn?: boolean }): SideMenuItem<CoordinatorTab> =>
  ({ kind: "section", id, label: COORDINATOR_TAB_LABEL[id], icon, ...extra });

/**
 * Menú lateral del panel del coordinador, agrupado por tema. Es el mismo menú
 * plegable del panel de administración (components/nav/SideMenu).
 */
export default function CoordinatorSidebar({ active, onSelect, isAdmin, counts }: {
  active: CoordinatorTab;
  onSelect: (tab: CoordinatorTab) => void;
  isAdmin: boolean;
  counts: { incidents: number; unassigned: number };
}) {
  const groups: SideMenuGroup<CoordinatorTab>[] = [
    {
      id: "mentores",
      title: "Mis mentores",
      items: [
        section("mentores", Users),
        section("supervision", ClipboardCheck),
        section("seguimiento", ClipboardList),
        section("evaluaciones", Star),
        section("disponibilidad", MapPin),
        section("reuniones", CalendarDays),
        ...(!isAdmin ? [section("crece", Sprout)] : []),
      ],
    },
    {
      id: "familias",
      title: "Familias y alumnos",
      items: [
        section("llamadas", Phone),
        section("info-familias", FolderOpen),
        section("informes", ClipboardList),
        section("propuestas", Compass),
      ],
    },
    {
      id: "clases",
      title: "Clases y registros",
      items: [
        section("clases", CalendarDays),
        section("incidencias", AlertTriangle, { badge: counts.incidents, warn: true }),
        section("registros", ClipboardList),
        section("vacaciones", CalendarOff),
        ...(isAdmin ? [section("sin-asignar", AlertTriangle, { badge: counts.unassigned, warn: true })] : []),
      ],
    },
  ];
  return (
    <SideMenu
      groups={groups}
      top={[section("inicio", Home)]}
      active={active}
      onSelect={onSelect}
      storageKey="kiru_coordinator_sidebar"
      title="Coordinación"
      titleIcon={isAdmin ? ShieldCheck : Compass}
    />
  );
}
