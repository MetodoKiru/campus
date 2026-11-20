import type { Metadata } from "next";
import "./globals.css";
import PreviewBanner from "@/components/PreviewBanner";

export const metadata: Metadata = {
  title: "Método Kiru | Mentoría Educativa y Técnicas de Estudio a Domicilio",
  description:
    "Mentoría pedagógica, autonomía y apoyo escolar personalizado a domicilio en Pozuelo de Alarcón, Aravaca, Valdemarín y Chamberí. Desarrollo de hábitos y técnicas de estudio.",
  keywords: [
    "Método Kiru",
    "mentoría educativa Madrid",
    "clases particulares Pozuelo",
    "apoyo escolar Aravaca",
    "técnicas de estudio Valdemarín",
    "profesor particular Chamberí",
    "autonomía escolar",
    "TDAH AACC Madrid"
  ],
  authors: [{ name: "Método Kiru" }],
  openGraph: {
    title: "Método Kiru | Mentoría y Autonomía Escolar a Domicilio",
    description:
      "Acompañamiento pedagógico personalizado en Madrid Noroeste (Pozuelo, Aravaca, Valdemarín y Chamberí).",
    locale: "es_ES",
    type: "website"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-[#FDFBF7] text-slate-800 antialiased selection:bg-slate-200">
        <PreviewBanner />
        {children}
      </body>
    </html>
  );
}