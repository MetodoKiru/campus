"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  CheckCircle2, 
  ArrowLeft, 
  FileText, 
  Download, 
  CreditCard, 
  Bell, 
  AlertCircle,
  ExternalLink 
} from "lucide-react";
import SkillCoinsChart from "@/components/SkillCoinsChart";
import { supabase } from "@/lib/supabase";

interface Child {
  name: string;
  username: string;
  avatarUrl?: string;
  level: string;
}

interface NoticeItem {
  id: string;
  title: string;
  targetStudent: string;
  date: string;
  content: string;
}

interface DocItem {
  id: string;
  title: string;
  targetStudent: string;
  type: string;
  requiresAcceptance: boolean;
  fileData?: string;
  fileName?: string;
}

interface PaymentRecord {
  id: string;
  studentUsername: string;
  concept: string;
  amount: number;
  dueDate: string;
  status: "Pagado" | "Pendiente";
  payLink: string;
}

const FALLBACK_CHILDREN: Child[] = [];

export default function PadrePage() {
  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    const verifyRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).single();
        if (error || !profile?.is_active || profile.role !== "padre" || user.app_metadata?.kiru_role !== "padre") {
          router.replace("/");
          return;
        }
        if (alive) setAuthorized(true);
      } catch { router.replace("/"); }
      finally { if (alive) setAuthChecking(false); }
    };
    void verifyRole();
    return () => { alive = false; };
  }, [router]);

  const router = useRouter();
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [activeTab, setActiveTab] = useState<"inicio" | "progreso" | "documentos" | "pagos">("inicio");

  // Lista de hijos dinámica cargada desde las cuentas de alumnos creadas
  const [childrenList, setChildrenList] = useState<Child[]>(FALLBACK_CHILDREN);

  // Estado de aceptaciones de documentos firmados
  const [acceptedLog, setAcceptedLog] = useState<Record<string, { user: string; date: string }>>({});

  // Documentos, avisos y pagos del sistema
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // SkillCoins automáticas
  const [scData, setScData] = useState({
    estudios: 8,
    compromiso: 9,
    organizacion: 7,
    bienestar: 9,
    updatedAt: "12/5/26"
  });

  useEffect(() => {
    // 1. Cargar dinámicamente TODOS los alumnos registrados en el sistema (tanto antiguos como nuevos)
    const rawUsers = localStorage.getItem("kiru_custom_users");
    if (rawUsers) {
      try {
        const parsed = JSON.parse(rawUsers);
        const students = parsed.filter((u: any) => u.role === "alumno");
        if (students.length > 0) {
          const mapped = students.map((s: any) => ({
            name: s.name.split(" ")[0], // Extrae el primer nombre
            username: s.username,
            avatarUrl: "",
            level: "Explorador (1)"
          }));
          setChildrenList(mapped);
        }
      } catch (e) {}
    }

    // 2. Cargar documentos
    const rawDocs = localStorage.getItem("kiru_admin_docs");
    if (rawDocs) {
      try { setDocs(JSON.parse(rawDocs)); } catch (e) {}
    } else {
      setDocs([
        {
          id: "d1",
          title: "Propuesta personalizada",
          targetStudent: "carmen",
          type: "Propuesta",
          requiresAcceptance: false,
          fileName: "Propuesta_Kiru_Carmen.pdf"
        },
        {
          id: "d2",
          title: "Normas de Método Kiru",
          targetStudent: "todos",
          type: "Normas",
          requiresAcceptance: true,
          fileName: "Normas_Metodo_Kiru_2026.pdf"
        }
      ]);
    }

    // 3. Cargar avisos
    const rawNotices = localStorage.getItem("kiru_admin_notices");
    if (rawNotices) {
      try { setNotices(JSON.parse(rawNotices)); } catch (e) {}
    } else {
      setNotices([
        {
          id: "n1",
          title: "Festivo Nacional",
          targetStudent: "todos",
          date: "12 de Octubre",
          content: "No habrá sesiones lectivas durante esta jornada festiva."
        }
      ]);
    }

    // 4. Cargar pagos
    const rawPayments = localStorage.getItem("kiru_admin_payments");
    if (rawPayments) {
      try { setPayments(JSON.parse(rawPayments)); } catch (e) {}
    } else {
      setPayments([
        {
          id: "p1",
          studentUsername: "carmen",
          concept: "Mentoría agosto",
          amount: 75,
          dueDate: "15/08/2026",
          status: "Pagado",
          payLink: "https://bizum.es"
        },
        {
          id: "p2",
          studentUsername: "carmen",
          concept: "Mentoría septiembre",
          amount: 75,
          dueDate: "15/09/2026",
          status: "Pendiente",
          payLink: "https://bizum.es"
        }
      ]);
    }

    // 5. Cargar registro de firmas
    const rawAccepted = localStorage.getItem("kiru_accepted_docs_log");
    if (rawAccepted) {
      try { setAcceptedLog(JSON.parse(rawAccepted)); } catch (e) {}
    }

    // 6. Cargar SkillCoins en vivo de Google Sheets
    const fetchSheetData = async () => {
      try {
        const sheetUrl = "https://docs.google.com/spreadsheets/d/1bgZYmXc4uol1GvfyD7QaAldnK37OG3hLC27jMVg6A1c/gviz/tq?tqx=out:json";
        const res = await fetch(sheetUrl);
        const text = await res.text();
        const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const data = JSON.parse(jsonText);
        const rows = data?.table?.rows;

        if (rows && rows.length > 0) {
          const lastRow = rows[rows.length - 1].c;
          let dateStr = "12/5/26";
          if (lastRow[0]?.f) dateStr = lastRow[0].f.split(" ")[0];
          else if (lastRow[0]?.v) dateStr = String(lastRow[0].v).split("T")[0];

          setScData({
            estudios: Number(lastRow[2]?.v) || 8,
            compromiso: Number(lastRow[3]?.v) || 9,
            organizacion: Number(lastRow[4]?.v) || 7,
            bienestar: Number(lastRow[5]?.v) || 9,
            updatedAt: dateStr
          });
        }
      } catch (e) {}
    };

    fetchSheetData();
  }, []);

  const handleConfirmDoc = (docId: string) => {
    const timestamp = new Date().toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const updated = {
      ...acceptedLog,
      [docId]: { user: "Familia", date: timestamp }
    };
    setAcceptedLog(updated);
    localStorage.setItem("kiru_accepted_docs_log", JSON.stringify(updated));
  };

  const currentChildDocs = docs.filter(
    (d) => d.targetStudent === "todos" || (selectedChild && d.targetStudent === selectedChild.username)
  );

  const currentChildNotices = notices.filter(
    (n) => n.targetStudent === "todos" || (selectedChild && n.targetStudent === selectedChild.username)
  );

  const currentChildPayments = payments.filter(
    (p) => !selectedChild || p.studentUsername === selectedChild.username
  );

  const pendingPayment = currentChildPayments.find((p) => p.status === "Pendiente");

  if (authChecking) return <main className="min-h-screen flex items-center justify-center text-sm text-slate-500">Comprobando permisos…</main>;
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1E293B] font-sans pb-16 selection:bg-slate-200">
      
      {!selectedChild ? (
        <div className="max-w-md mx-auto px-4 sm:px-6 pt-5 space-y-6">
          <header className="flex items-center justify-between pb-3">
            <button
              onClick={() => router.push("/")}
              title="Cerrar sesión"
              className="p-2.5 rounded-2xl border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 text-slate-900"
              >
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </button>
            <span className="text-xs font-serif font-bold text-slate-400 uppercase tracking-widest">
              Método Kiru
            </span>
          </header>

          <div className="space-y-1 text-left">
            <h2 className="text-2xl font-serif text-slate-900 font-bold">Mis hijos</h2>
            <p className="text-xs text-slate-500">
              Selecciona un alumno para acceder a su espacio individual.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {childrenList.map((child) => (
              <div
                key={child.username}
                onClick={() => {
                  setSelectedChild(child);
                  setActiveTab("inicio");
                }}
                className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between active:scale-[0.99]"
              >
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-slate-900">{child.name}</h3>
                  <p className="text-xs text-slate-500 font-medium">{child.level}</p>
                </div>

                <div className="relative">
                  <div aria-label={child.name} className="w-14 h-14 rounded-full border border-[#E7D8C4] bg-[#F5EBDD] text-[#805D3B] flex items-center justify-center font-serif text-lg font-bold">
                    {child.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 space-y-5">
          
          <header className="bg-white rounded-2xl border border-slate-200 p-2 flex items-center justify-between shadow-sm sticky top-3 z-30">
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] sm:text-xs font-semibold scrollbar-none py-0.5">
              <button
                onClick={() => setActiveTab("inicio")}
                className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
                  activeTab === "inicio" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Inicio
              </button>
              <button
                onClick={() => setActiveTab("progreso")}
                className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
                  activeTab === "progreso" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Progreso
              </button>
              <button
                onClick={() => setActiveTab("documentos")}
                className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
                  activeTab === "documentos" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Mis documentos
              </button>
              <button
                onClick={() => setActiveTab("pagos")}
                className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
                  activeTab === "pagos" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Mis pagos
              </button>
              <button
                onClick={() => router.push("/")}
                title="Cerrar sesión"
                className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition ml-1 shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3.5 h-3.5 text-slate-900"
                >
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => setSelectedChild(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF8F5] border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition shrink-0 ml-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mis hijos</span>
            </button>
          </header>

          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div aria-label={selectedChild.name} className="w-12 h-12 rounded-full border border-[#E7D8C4] bg-[#F5EBDD] text-[#805D3B] flex items-center justify-center font-serif font-bold">
                {selectedChild.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-slate-900 leading-tight">{selectedChild.name}</h2>
                <span className="text-[11px] text-slate-500 font-medium">{selectedChild.level}</span>
              </div>
            </div>

            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              Activo
            </span>
          </div>

          {activeTab === "inicio" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-serif text-lg text-slate-900 font-bold">Avisos importantes</h3>
                <p className="text-xs text-slate-500">Comunicaciones de Método Kiru, festivos y cambios de horario.</p>
              </div>

              {currentChildNotices.length > 0 ? (
                <div className="space-y-3">
                  {currentChildNotices.map((n) => (
                    <div
                      key={n.id}
                      className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-xs text-slate-900">{n.title}</span>
                        <span className="text-[10px] text-slate-400">{n.date}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{n.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
                  No hay avisos pendientes en este momento.
                </div>
              )}

              <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-slate-200/80 text-[11px] text-slate-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Las incidencias de las sesiones se actualizarán automáticamente aquí tras cada registro de sesión del mentor.</span>
              </div>
            </div>
          )}

          {activeTab === "progreso" && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-serif text-lg text-slate-900 font-bold">SkillCoins Semanales</h3>
                  <p className="text-xs text-slate-500">Puntuación obtenida en la última sesión (no acumuladas).</p>
                </div>
                <span className="text-[10px] font-medium text-slate-400">Actualizado el {scData.updatedAt}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Estudios</span>
                  <p className="text-2xl font-serif font-bold text-emerald-950">{scData.estudios} SC</p>
                  <span className="text-[10px] text-slate-500 block">Técnicas y asimilación</span>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Compromiso</span>
                  <p className="text-2xl font-serif font-bold text-blue-950">{scData.compromiso} SC</p>
                  <span className="text-[10px] text-slate-500 block">Actitud y puntualidad</span>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Organización</span>
                  <p className="text-2xl font-serif font-bold text-amber-950">{scData.organizacion} SC</p>
                  <span className="text-[10px] text-slate-500 block">Agenda y orden</span>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Bienestar</span>
                  <p className="text-2xl font-serif font-bold text-purple-950">{scData.bienestar} SC</p>
                  <span className="text-[10px] text-slate-500 block">Calma y confianza</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <SkillCoinsChart />
              </div>
            </div>
          )}

          {activeTab === "documentos" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-serif text-lg text-slate-900 font-bold">Mis documentos</h3>
                <p className="text-xs text-slate-500">Documentación vinculada a {selectedChild.name}.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentChildDocs.map((doc) => {
                  const isAccepted = !!acceptedLog[doc.id];

                  return (
                    <div
                      key={doc.id}
                      className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {doc.type}
                          </span>
                          {doc.requiresAcceptance && !isAccepted && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              Pendiente de aceptación
                            </span>
                          )}
                        </div>

                        <h4 className="font-serif text-sm font-bold text-slate-900 leading-snug">
                          {doc.title}
                        </h4>

                        <div className="w-full h-28 bg-[#FAF8F5] border border-slate-200 rounded-2xl flex flex-col items-center justify-center p-3 text-center space-y-1 shadow-inner">
                          <FileText className="w-7 h-7 text-slate-400" />
                          <span className="text-[11px] font-medium text-slate-500 truncate max-w-[180px]">
                            {doc.fileName || "Documento PDF"}
                          </span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest">Previsualización</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {doc.fileData ? (
                          <a
                            href={doc.fileData}
                            download={doc.fileName || "documento.pdf"}
                            className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-xl text-center flex items-center justify-center gap-1.5 transition shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            <span>Abrir documento</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => alert(`Abriendo: ${doc.title}`)}
                            className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            <span>Abrir documento</span>
                          </button>
                        )}

                        {doc.requiresAcceptance && (
                          <div className="pt-1">
                            {isAccepted ? (
                              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[10px] text-emerald-800 space-y-0.5">
                                <p className="font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-700" /> Documento aceptado
                                </p>
                                <p className="text-emerald-700/80">
                                  Por: {acceptedLog[doc.id].user} · {acceptedLog[doc.id].date}
                                </p>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConfirmDoc(doc.id)}
                                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-sm"
                              >
                                He leído y acepto este documento
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "pagos" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-serif text-lg text-slate-900 font-bold">Mis pagos</h3>
                <p className="text-xs text-slate-500">Historial de facturación y cuotas de acompañamiento.</p>
              </div>

              {pendingPayment && (
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Próximo pago
                  </span>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl font-serif font-bold text-slate-900">{pendingPayment.amount} €</span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Fecha límite: {pendingPayment.dueDate} · <strong className="text-amber-700">Pendiente</strong>
                      </p>
                    </div>

                    <a
                      href={pendingPayment.payLink || "https://bizum.es"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition shadow-sm inline-flex items-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Pagar</span>
                    </a>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-3">
                <h4 className="font-serif text-sm font-bold text-slate-900">Historial de pagos</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b border-slate-100 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="pb-2">Fecha</th>
                        <th className="pb-2">Concepto</th>
                        <th className="pb-2">Importe</th>
                        <th className="pb-2 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentChildPayments.map((pay) => (
                        <tr key={pay.id}>
                          <td className="py-3 text-slate-500">{pay.dueDate}</td>
                          <td className="py-3 font-medium text-slate-800">{pay.concept}</td>
                          <td className="py-3 font-serif font-bold text-slate-900">{pay.amount} €</td>
                          <td className="py-3 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                pay.status === "Pagado"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {pay.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}