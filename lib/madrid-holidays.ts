export interface MadridHoliday {
  date: string;
  name: string;
}

// Festivos laborales oficiales de la ciudad de Madrid. Mantener actualizado
// cada año cuando Ayuntamiento y Comunidad publiquen su calendario oficial.
export const MADRID_HOLIDAYS: Record<number, MadridHoliday[]> = {
  2026: [
    { date: "2026-01-01", name: "Año Nuevo" },
    { date: "2026-01-06", name: "Epifanía del Señor" },
    { date: "2026-04-02", name: "Jueves Santo" },
    { date: "2026-04-03", name: "Viernes Santo" },
    { date: "2026-05-01", name: "Fiesta del Trabajo" },
    { date: "2026-05-02", name: "Fiesta de la Comunidad de Madrid" },
    { date: "2026-05-15", name: "San Isidro Labrador" },
    { date: "2026-08-15", name: "Asunción de la Virgen" },
    { date: "2026-10-12", name: "Fiesta Nacional de España" },
    { date: "2026-11-02", name: "Traslado de Todos los Santos" },
    { date: "2026-11-09", name: "Nuestra Señora de la Almudena" },
    { date: "2026-12-07", name: "Traslado del Día de la Constitución" },
    { date: "2026-12-08", name: "Inmaculada Concepción" },
    { date: "2026-12-25", name: "Natividad del Señor" },
  ],
  2027: [
    { date: "2027-01-01", name: "Año Nuevo" },
    { date: "2027-01-06", name: "Epifanía del Señor" },
    { date: "2027-03-19", name: "San José" },
    { date: "2027-03-25", name: "Jueves Santo" },
    { date: "2027-03-26", name: "Viernes Santo" },
    { date: "2027-05-01", name: "Fiesta del Trabajo" },
    { date: "2027-05-15", name: "San Isidro Labrador" },
    { date: "2027-08-16", name: "Traslado de la Asunción de la Virgen" },
    { date: "2027-10-12", name: "Fiesta Nacional de España" },
    { date: "2027-11-01", name: "Día de Todos los Santos" },
    { date: "2027-11-09", name: "Nuestra Señora de la Almudena" },
    { date: "2027-12-06", name: "Día de la Constitución" },
    { date: "2027-12-08", name: "Inmaculada Concepción" },
    { date: "2027-12-25", name: "Natividad del Señor" },
  ],
};

export function madridHolidayMap(year: number): Map<string, string> {
  return new Map((MADRID_HOLIDAYS[year] ?? []).map((holiday) => [holiday.date, holiday.name]));
}
