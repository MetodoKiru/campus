"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { 
  UserPlus, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  X,
  Save,
  Link2,
  CheckCircle2,
  Bell,
  FileText,
  Plus,
  Users,
  CreditCard,
  Upload,
  ExternalLink,
  Download
} from "lucide-react";

interface UserAccount {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: "alumno" | "mentor" | "padre" | "admin";
  createdAt: string;
  assignedParent?: string; // Vinculación alumno -> padre
}

interface MentorStudentLink {
  studentUsername: string;
  mentorUsername: string;
}

interface Notice {
  id: string;
  title: string;
  targetStudent: string; // username del alumno o "todos"
  date: string;
  content: string;
  linkUrl?: string;
  linkTitle?: string;
  fileData?: string; // Base64 PDF
  fileName?: string;
}

interface DocumentItem {
  id: string;
  title: string;
  targetStudent: string; // username del alumno o "todos"
  type: string;
  requiresAcceptance: boolean;
  accepted?: boolean;
  acceptedAt?: string;
  fileData?: string; // Base64 del archivo PDF real
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

// No demo accounts or passwords are bundled in the administration panel.
const DEFAULT_USERS: UserAccount[] = [];
const DEFAULT_LINKS: MentorStudentLink[] = [];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"usuarios" | "avisos" | "documentos" | "pagos">("usuarios");

  const [users, setUsers] = useState<UserAccount[]>(DEFAULT_USERS);
  const [links, setLinks] = useState<MentorStudentLink[]>(DEFAULT_LINKS);
  
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"alumno" | "mentor" | "padre" | "admin">("alumno");
  
  // Mentor <-> Alumno
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedMentor, setSelectedMentor] = useState("");

  // Padre <-> Alumno
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedParent, setSelectedParent] = useState("");

  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Avisos (con soporte para enlaces y PDFs)
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeTarget, setNoticeTarget] = useState("todos");
  const [noticeContent, setNoticeContent] = useState("");
  const [noticeLinkUrl, setNoticeLinkUrl] = useState("");
  const [noticeLinkTitle, setNoticeLinkTitle] = useState("");
  const [noticePdf, setNoticePdf] = useState<{ name: string; base64: string } | null>(null);

  // Documentos PDF
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docTitle, setDocTitle] = useState("");
  const [docTarget, setDocTarget] = useState("todos");
  const [docType, setDocType] = useState("Propuesta");
  const [requiresSign, setRequiresSign] = useState(false);
  const [uploadedPdf, setUploadedPdf] = useState<{ name: string; base64: string } | null>(null);

  // Pagos (con edición completa y actualización de historial/enlaces)
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [payStudent, setPayStudent] = useState("");
  const [payConcept, setPayConcept] = useState("Mentoría mensual");
  const [payAmount, setPayAmount] = useState(75);
  const [payDueDate, setPayDueDate] = useState("15/09/2026");
  const [payStatus, setPayStatus] = useState<"Pagado" | "Pendiente">("Pendiente");
  const [payLink, setPayLink] = useState("https://bizum.es");
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);

  useEffect(() => {
    // Cargar usuarios reales desde Supabase.
    const loadUsers = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const response = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudieron cargar los usuarios.");
        setUsers((result.users || []).map((u: any) => ({
          id: u.id, name: u.full_name, username: u.username, role: u.role,
          createdAt: u.created_at ? String(u.created_at).slice(0, 10) : "",
        })));
      } catch (error) {
        setMsg({ text: error instanceof Error ? error.message : "Error cargando usuarios.", type: "error" });
      }
    };
    void loadUsers();

    // Cargar enlaces mentor de forma estricta individual
    const savedLinks = localStorage.getItem("kiru_mentor_links");
    if (savedLinks) {
      try {
        setLinks(JSON.parse(savedLinks));
      } catch (e) {
        console.error(e);
      }
    }

    // Cargar avisos
    const savedNotices = localStorage.getItem("kiru_admin_notices");
    if (savedNotices) {
      try {
        setNotices(JSON.parse(savedNotices));
      } catch (e) {
        console.error(e);
      }
    } else {
      setNotices([]);
    }

    // Cargar documentos
    const savedDocs = localStorage.getItem("kiru_admin_docs");
    if (savedDocs) {
      try {
        setDocuments(JSON.parse(savedDocs));
      } catch (e) {
        console.error(e);
      }
    } else {
      setDocuments([]);
    }

    // Cargar pagos
    const savedPayments = localStorage.getItem("kiru_admin_payments");
    if (savedPayments) {
      try {
        setPayments(JSON.parse(savedPayments));
      } catch (e) {
        console.error(e);
      }
    } else {
      setPayments([]);
    }
  }, []);

  const saveToStorage = (updatedUsers: UserAccount[]) => {
    setUsers(updatedUsers);
    localStorage.setItem("kiru_custom_users", JSON.stringify(updatedUsers));
  };

  const saveLinksToStorage = (updatedLinks: MentorStudentLink[]) => {
    setLinks(updatedLinks);
    localStorage.setItem("kiru_mentor_links", JSON.stringify(updatedLinks));
  };

  // Subida de PDF en Avisos
  const handleNoticePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNoticePdf({ name: file.name, base64: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // Subida de PDF en Documentos
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedPdf({ name: file.name, base64: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // Crear usuario con vinculación automática a padres
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password) {
      setMsg({ text: "Completa nombre, usuario y contraseña.", type: "error" });
      return;
    }
    if (role !== "alumno" && !email.trim()) {
      setMsg({ text: "Para padres, mentores y administradores es necesario un correo propio.", type: "error" });
      return;
    }
    if (password.length < 12) {
      setMsg({ text: "La contraseña debe tener al menos 12 caracteres.", type: "error" });
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fullName: name.trim(), username: username.trim().toLowerCase(), email: email.trim(), password, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo crear el usuario.");
      const created = result.user;
      setUsers((current) => [{
        id: created.id, name: created.full_name, username: created.username, role: created.role,
        createdAt: new Date().toISOString().slice(0, 10),
      }, ...current]);
      setName(""); setUsername(""); setEmail(""); setPassword(""); setRole("alumno");
      setMsg({ text: `Cuenta real de Supabase creada para «${created.username}».`, type: "success" });
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Error creando usuario.", type: "error" });
    }
  };

  const handleResetPassword = async (user: UserAccount) => {
    const nextPassword = window.prompt(`Nueva contraseña provisional para @${user.username} (mínimo 12 caracteres):`);
    if (nextPassword === null) return;
    if (nextPassword.length < 12) {
      setMsg({ text: "La contraseña debe tener al menos 12 caracteres.", type: "error" });
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: user.id, password: nextPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo restablecer la contraseña.");
      setMsg({ text: `Contraseña restablecida para @${user.username}.`, type: "success" });
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Error restableciendo la contraseña.", type: "error" });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editingUser.name.trim() || !editingUser.username.trim()) {
      setMsg({ text: "Nombre y usuario son obligatorios.", type: "error" });
      return;
    }
    const cleanUsername = editingUser.username.trim().toLowerCase();
    const existsOther = users.some((u) => u.id !== editingUser.id && u.username.toLowerCase() === cleanUsername);
    if (existsOther) {
      setMsg({ text: "Ese nombre de usuario ya pertenece a otra cuenta.", type: "error" });
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: editingUser.id, fullName: editingUser.name.trim(), username: cleanUsername, role: editingUser.role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudieron guardar los cambios.");
      const oldUsername = users.find((u) => u.id === editingUser.id)?.username;
      const updated = users.map((u) => u.id === editingUser.id ? { ...editingUser, username: cleanUsername } : u);
      if (oldUsername && oldUsername !== cleanUsername) {
        const updatedLinks = links.map((l) => l.studentUsername === oldUsername ? { ...l, studentUsername: cleanUsername } : l.mentorUsername === oldUsername ? { ...l, mentorUsername: cleanUsername } : l);
        saveLinksToStorage(updatedLinks);
      }
      setUsers(updated);
      setEditingUser(null);
      setMsg({ text: `Usuario «${cleanUsername}» actualizado en Supabase.`, type: "success" });
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "Error guardando cambios.", type: "error" });
    }
  };

  const handleDeleteUser = (id: string, userToDelete: string) => {
    if (userToDelete === "admin") {
      setMsg({ text: "No puedes eliminar el usuario administrador principal.", type: "error" });
      return;
    }
    const updated = users.filter((u) => u.id !== id);
    saveToStorage(updated);

    const updatedLinks = links.filter(
      l => l.studentUsername !== userToDelete && l.mentorUsername !== userToDelete
    );
    saveLinksToStorage(updatedLinks);

    setMsg({ text: `Usuario «${userToDelete}» eliminado.`, type: "success" });
    setTimeout(() => setMsg(null), 4000);
  };

  // Mentor <-> Alumno (CORREGIDO PARA EVITAR QUE UN ALUMNO TENGA MÚLTIPLES MENTORES)
  const handleAssignMentor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedMentor) {
      setMsg({ text: "Selecciona tanto un alumno como un mentor.", type: "error" });
      return;
    }

    // Eliminamos cualquier asignación previa de este alumno específico para que solo tenga UN mentor exclusivo
    const filtered = links.filter(l => l.studentUsername !== selectedStudent);
    const updatedLinks = [...filtered, { studentUsername: selectedStudent, mentorUsername: selectedMentor }];
    saveLinksToStorage(updatedLinks);

    setMsg({ 
      text: `Vinculación exclusiva guardada: @${selectedStudent} asignado/a únicamente a @${selectedMentor}.`, 
      type: "success" 
    });
    setTimeout(() => setMsg(null), 4000);
  };

  // Padre <-> Alumno
  const handleAssignParent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild || !selectedParent) {
      setMsg({ text: "Selecciona tanto un alumno como un tutor familiar.", type: "error" });
      return;
    }

    const updated = users.map(u => u.username === selectedChild ? { ...u, assignedParent: selectedParent } : u);
    saveToStorage(updated);
    setMsg({ text: `Vinculación guardada: Alumno @${selectedChild} asignado a Familia @${selectedParent}.`, type: "success" });
    setTimeout(() => setMsg(null), 4000);
  };

  // Avisos (con Enlace y PDF)
  const handleCreateNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeContent.trim()) return;

    const newNotice: Notice = {
      id: Date.now().toString(),
      title: noticeTitle.trim(),
      targetStudent: noticeTarget,
      date: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      content: noticeContent.trim(),
      linkUrl: noticeLinkUrl.trim() || undefined,
      linkTitle: noticeLinkTitle.trim() || (noticeLinkUrl ? "Abrir enlace de interés" : undefined),
      fileData: noticePdf?.base64,
      fileName: noticePdf?.name
    };

    const updated = [newNotice, ...notices];
    setNotices(updated);
    localStorage.setItem("kiru_admin_notices", JSON.stringify(updated));

    setNoticeTitle("");
    setNoticeContent("");
    setNoticeLinkUrl("");
    setNoticeLinkTitle("");
    setNoticePdf(null);
    setMsg({ text: "Aviso publicado con éxito.", type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDeleteNotice = (id: string) => {
    const updated = notices.filter((n) => n.id !== id);
    setNotices(updated);
    localStorage.setItem("kiru_admin_notices", JSON.stringify(updated));
    setMsg({ text: "Aviso eliminado.", type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  // Documentos
  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) return;

    const newDoc: DocumentItem = {
      id: Date.now().toString(),
      title: docTitle.trim(),
      targetStudent: docTarget,
      type: docType,
      requiresAcceptance: requiresSign,
      accepted: false,
      fileData: uploadedPdf?.base64,
      fileName: uploadedPdf?.name
    };

    const updated = [newDoc, ...documents];
    setDocuments(updated);
    localStorage.setItem("kiru_admin_docs", JSON.stringify(updated));

    setDocTitle("");
    setRequiresSign(false);
    setUploadedPdf(null);
    setMsg({ text: "Documento publicado y disponible en el panel familiar.", type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDeleteDoc = (id: string) => {
    const updated = documents.filter((d) => d.id !== id);
    setDocuments(updated);
    localStorage.setItem("kiru_admin_docs", JSON.stringify(updated));
    setMsg({ text: "Documento eliminado.", type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  // Pagos
  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    const target = payStudent || alumnos[0]?.username || "carmen";
    const newPay: PaymentRecord = {
      id: Date.now().toString(),
      studentUsername: target,
      concept: payConcept.trim(),
      amount: payAmount,
      dueDate: payDueDate.trim(),
      status: payStatus,
      payLink: payLink.trim()
    };

    const updated = [newPay, ...payments];
    setPayments(updated);
    localStorage.setItem("kiru_admin_payments", JSON.stringify(updated));
    setMsg({ text: `Pago registrado correctamente para @${target}.`, type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleUpdatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    const updated = payments.map(p => p.id === editingPayment.id ? editingPayment : p);
    setPayments(updated);
    localStorage.setItem("kiru_admin_payments", JSON.stringify(updated));
    setEditingPayment(null);
    setMsg({ text: "Historial de pagos actualizado con éxito.", type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDeletePayment = (id: string) => {
    const updated = payments.filter(p => p.id !== id);
    setPayments(updated);
    localStorage.setItem("kiru_admin_payments", JSON.stringify(updated));
    setMsg({ text: "Entrada eliminada del historial de pagos.", type: "success" });
    setTimeout(() => setMsg(null), 3000);
  };

  const togglePaymentStatus = (id: string) => {
    const updated = payments.map(p => p.id === id ? { ...p, status: (p.status === "Pagado" ? "Pendiente" : "Pagado") as "Pagado" | "Pendiente" } : p);
    setPayments(updated);
    localStorage.setItem("kiru_admin_payments", JSON.stringify(updated));
  };

  const alumnos = users.filter(u => u.role === "alumno");
  const mentores = users.filter(u => u.role === "mentor");
  const padres = users.filter(u => u.role === "padre");

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1E293B] pb-16 font-sans">
      {/* Cabecera */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-800" />
          <div>
            <h1 className="font-serif text-xl sm:text-2xl text-slate-900 font-bold">Panel de Administración</h1>
            <p className="text-[11px] sm:text-xs text-slate-500">Gestión general del campus educativo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/previsualizacion"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Previsualizar campus</span>
            <span className="sm:hidden">Vista previa</span>
          </Link>
          <Link 
          href="/" 
          title="Cerrar sesión"
          className="p-2 sm:p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 transition-colors flex items-center justify-center shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-900">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Notificaciones */}
        {msg && (
          <div
            className={`p-4 rounded-2xl text-xs font-medium flex items-center justify-between transition-all ${
              msg.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Pestañas de navegación */}
        <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex flex-wrap gap-2 shadow-sm text-xs font-semibold w-fit">
          <button
            onClick={() => setActiveTab("usuarios")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "usuarios" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Usuarios y Enlaces</span>
          </button>
          <button
            onClick={() => setActiveTab("documentos")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "documentos" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Gestión de Documentos PDF</span>
          </button>
          <button
            onClick={() => setActiveTab("pagos")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "pagos" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Gestión de Pagos</span>
          </button>
          <button
            onClick={() => setActiveTab("avisos")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
              activeTab === "avisos" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Gestión de Avisos</span>
          </button>
        </div>

        {/* SECCIÓN 1: USUARIOS Y VÍNCULOS */}
        {activeTab === "usuarios" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              {/* Crear Usuario */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-800" />
                  <h2 className="font-serif text-lg text-slate-900">Crear nuevo usuario</h2>
                </div>
                <form onSubmit={handleCreateUser} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre completo</label>
                    <input type="text" placeholder="Ej: Lucía Navarro" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-medium text-slate-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario</label>
                    <input type="text" placeholder="Ej: lucia" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-medium text-slate-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Correo electrónico (no necesario para alumnos)</label>
                    <input type="email" placeholder="correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-medium text-slate-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña (mínimo 12 caracteres)</label>
                    <input type="password" autoComplete="new-password" placeholder="Mínimo 12 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-medium text-slate-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de usuario / Rol</label>
                    <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-900 focus:outline-none">
                      <option value="alumno">Alumno</option>
                      <option value="mentor">Mentor</option>
                      <option value="padre">Padre / Madre</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-3 bg-slate-900 text-white text-xs font-semibold rounded-2xl hover:bg-slate-800 transition-colors shadow-sm flex items-center justify-center gap-2 mt-2">
                    <UserPlus className="w-4 h-4" /> Registrar Usuario
                  </button>
                </form>
              </div>

              {/* Enlazar Mentor y Alumno */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-blue-600" />
                  <h2 className="font-serif text-lg text-slate-900">Enlazar Mentor y Alumno</h2>
                </div>
                <form onSubmit={handleAssignMentor} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alumno</label>
                    <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-900">
                      <option value="">-- Elige un alumno --</option>
                      {alumnos.map((a) => (<option key={a.id} value={a.username}>{a.name} (@{a.username})</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mentor</label>
                    <select value={selectedMentor} onChange={(e) => setSelectedMentor(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-900">
                      <option value="">-- Elige un mentor --</option>
                      {mentores.map((m) => (<option key={m.id} value={m.username}>{m.name} (@{m.username})</option>))}
                    </select>
                  </div>
                  <button type="submit" disabled={!selectedStudent || !selectedMentor} className="w-full py-3 bg-blue-700 text-white text-xs font-semibold rounded-2xl hover:bg-blue-800 transition shadow-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-40">
                    <Link2 className="w-4 h-4" /> Asignar Mentor
                  </button>
                </form>
              </div>

              {/* Enlazar Alumno y Familia */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-amber-600" />
                  <h2 className="font-serif text-lg text-slate-900">Enlazar Alumno y Familia</h2>
                </div>
                <form onSubmit={handleAssignParent} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alumno</label>
                    <select value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-900">
                      <option value="">-- Elige un alumno --</option>
                      {alumnos.map((a) => (<option key={a.id} value={a.username}>{a.name} (@{a.username})</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Familia / Tutor</label>
                    <select value={selectedParent} onChange={(e) => setSelectedParent(e.target.value)} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-900">
                      <option value="">-- Elige un usuario padre --</option>
                      {padres.map((p) => (<option key={p.id} value={p.username}>{p.name} (@{p.username})</option>))}
                    </select>
                  </div>
                  <button type="submit" disabled={!selectedChild || !selectedParent} className="w-full py-3 bg-amber-700 text-white text-xs font-semibold rounded-2xl hover:bg-amber-800 transition shadow-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-40">
                    <Link2 className="w-4 h-4" /> Asignar Familia
                  </button>
                </form>
              </div>
            </div>

            {/* Tabla de Usuarios */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="font-serif text-lg text-slate-900">Usuarios registrados ({users.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                      <th className="pb-3 pl-2">Nombre / Usuario</th>
                      <th className="pb-3">Rol</th>
                      <th className="pb-3">Mentor</th>
                      <th className="pb-3">Familia</th>
                      <th className="pb-3 text-right pr-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-900">
                    {users.map((user) => {
                      const mentorLink = links.find(l => l.studentUsername === user.username);
                      return (
                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 pl-2">
                            <p className="font-bold text-slate-900">{user.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">@{user.username}</p>
                          </td>
                          <td className="py-3.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              user.role === "admin" ? "bg-purple-100 text-purple-700" :
                              user.role === "mentor" ? "bg-blue-100 text-blue-700" :
                              user.role === "padre" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3.5">
                            {user.role === "alumno" ? (
                              mentorLink ? (
                                <span className="text-[11px] font-semibold text-blue-700">@{mentorLink.mentorUsername}</span>
                              ) : <span className="text-[11px] text-slate-400 italic">Sin asignar</span>
                            ) : "—"}
                          </td>
                          <td className="py-3.5">
                            {user.role === "alumno" ? (
                              user.assignedParent ? (
                                <span className="text-[11px] font-semibold text-amber-700">@{user.assignedParent}</span>
                              ) : <span className="text-[11px] text-slate-400 italic">Sin asignar</span>
                            ) : "—"}
                          </td>
                          <td className="py-3.5 text-right pr-2">
                            <div className="flex items-center justify-end gap-1.5">
                              <button title="Restablecer contraseña" onClick={() => void handleResetPassword(user)} className="px-2 py-1.5 text-[10px] font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition">Contraseña</button>
                              <button onClick={() => setEditingUser(user)} className="p-2 rounded-xl border border-slate-200 bg-[#F7F6F3] hover:bg-slate-900 hover:text-white transition">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteUser(user.id, user.username)} className="p-2 rounded-xl border border-slate-200 bg-[#F7F6F3] hover:bg-rose-600 hover:text-white transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 2: GESTIÓN DE DOCUMENTOS PDF REALES */}
        {activeTab === "documentos" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 md:col-span-1 h-fit">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <h2 className="font-serif text-base text-slate-900">Subir Documento PDF</h2>
              </div>

              <form onSubmit={handleCreateDocument} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Título del documento</label>
                  <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Ej: Propuesta de Acompañamiento" className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs" required />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Asignar a</label>
                  <select value={docTarget} onChange={(e) => setDocTarget(e.target.value)} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs text-slate-800">
                    <option value="todos">Todos los alumnos / Padres</option>
                    {alumnos.map((a) => (<option key={a.id} value={a.username}>{a.name} (@{a.username})</option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Tipo de documento</label>
                  <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs text-slate-800">
                    <option value="Propuesta">Propuesta personalizada</option>
                    <option value="Normas">Normas de Método Kiru</option>
                    <option value="Informe">Informe pedagógico</option>
                    <option value="Otro">Otro documento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Adjuntar Archivo PDF</label>
                  <input type="file" accept=".pdf" onChange={handlePdfUpload} className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-slate-900 file:text-white file:text-xs" />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="requireSignCheck" checked={requiresSign} onChange={(e) => setRequiresSign(e.target.checked)} className="rounded border-slate-300 text-slate-900 focus:ring-0" />
                  <label htmlFor="requireSignCheck" className="text-xs text-slate-600">Requiere confirmación de lectura</label>
                </div>

                <button type="submit" className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-1.5 shadow-sm">
                  <Plus className="w-4 h-4" /> Publicar Documento
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 md:col-span-2">
              <h2 className="font-serif text-base text-slate-900">Documentos Publicados ({documents.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {documents.map((d) => (
                  <div key={d.id} className="p-4 rounded-2xl border border-slate-100 bg-[#FAF8F5] flex flex-col justify-between space-y-3 shadow-sm">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{d.type}</span>
                        <button onClick={() => handleDeleteDoc(d.id)} className="text-slate-400 hover:text-rose-600 transition" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <h3 className="font-serif text-sm text-slate-900 font-medium mt-1">{d.title}</h3>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Asignado a: <strong className="text-slate-700">{d.targetStudent === "todos" ? "Todos" : `@${d.targetStudent}`}</strong>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                      {d.fileData ? (
                        <a href={d.fileData} download={d.fileName || "documento.pdf"} className="text-emerald-700 font-bold hover:underline">
                          Descargar ({d.fileName || "PDF"})
                        </a>
                      ) : (
                        <span className="text-slate-400">PDF del sistema</span>
                      )}
                      {d.requiresAcceptance ? <span className="text-amber-700 font-semibold">● Requiere firma</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 3: GESTIÓN DE PAGOS AVANZADA (CON EDICIÓN, ENLACES Y BORRADO) */}
        {activeTab === "pagos" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 md:col-span-1 h-fit">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-700" />
                <h2 className="font-serif text-base text-slate-900">Crear o Programar Pago</h2>
              </div>

              <form onSubmit={handleCreatePayment} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Alumno</label>
                  <select value={payStudent} onChange={(e) => setPayStudent(e.target.value)} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl">
                    {alumnos.map((a) => (<option key={a.id} value={a.username}>{a.name} (@{a.username})</option>))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Concepto</label>
                  <input type="text" value={payConcept} onChange={(e) => setPayConcept(e.target.value)} placeholder="Ej: Mentoría septiembre" className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Importe (€)</label>
                  <input type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de vencimiento</label>
                  <input type="text" value={payDueDate} onChange={(e) => setPayDueDate(e.target.value)} placeholder="15/09/2026" className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Estado</label>
                  <select value={payStatus} onChange={(e) => setPayStatus(e.target.value as any)} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl">
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pagado">Pagado</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Enlace de Pago</label>
                  <input type="text" value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://..." className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
                </div>

                <button type="submit" className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition">
                  Crear y Publicar Pago
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 md:col-span-2">
              <h2 className="font-serif text-base text-slate-900">Historial y Control de Pagos ({payments.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAF8F5] border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Alumno</th>
                      <th className="p-3">Concepto</th>
                      <th className="p-3">Importe</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="p-3 text-slate-500">{p.dueDate}</td>
                        <td className="p-3 font-semibold">@{p.studentUsername}</td>
                        <td className="p-3">{p.concept}</td>
                        <td className="p-3 font-bold">{p.amount} €</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${p.status === "Pagado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button onClick={() => togglePaymentStatus(p.id)} className="underline text-slate-600 hover:text-slate-900 font-medium">
                            Estado
                          </button>
                          <button onClick={() => setEditingPayment(p)} className="underline text-blue-600 hover:text-blue-800 font-medium">
                            Editar
                          </button>
                          <button onClick={() => handleDeletePayment(p.id)} className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg inline-block align-middle" title="Eliminar entrada">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 4: GESTIÓN DE AVISOS (CON PDF Y ENLACES) */}
        {activeTab === "avisos" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 md:col-span-1 h-fit">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-700" />
                <h2 className="font-serif text-base text-slate-900">Crear Comunicación</h2>
              </div>

              <form onSubmit={handleCreateNotice} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Título del aviso</label>
                  <input type="text" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Ej: Festivo o cambio de hora" className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs" required />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Destinatario</label>
                  <select value={noticeTarget} onChange={(e) => setNoticeTarget(e.target.value)} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs text-slate-800">
                    <option value="todos">Todos los alumnos / Familias</option>
                    {alumnos.map((a) => (<option key={a.id} value={a.username}>{a.name} (@{a.username})</option>))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Mensaje</label>
                  <textarea rows={3} value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} placeholder="Escribe el texto del aviso..." className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs" required />
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Enlace opcional</span>
                  <input type="url" value={noticeLinkUrl} onChange={(e) => setNoticeLinkUrl(e.target.value)} placeholder="https://..." className="w-full p-2 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs" />
                  <input type="text" value={noticeLinkTitle} onChange={(e) => setNoticeLinkTitle(e.target.value)} placeholder="Texto del botón (ej: Ver información)" className="w-full p-2 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs" />
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">PDF adjunto opcional</span>
                  <input type="file" accept=".pdf" onChange={handleNoticePdfUpload} className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-xl file:border-0 file:bg-slate-900 file:text-white file:text-xs" />
                </div>

                <button type="submit" className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-1.5 shadow-sm mt-3">
                  <Plus className="w-4 h-4" /> Publicar Aviso
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 md:col-span-2">
              <h2 className="font-serif text-base text-slate-900">Avisos Activos ({notices.length})</h2>
              <div className="space-y-3">
                {notices.map((n) => (
                  <div key={n.id} className="p-4 rounded-2xl border border-slate-100 bg-[#FAF8F5] space-y-3 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900">{n.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
                            {n.targetStudent === "todos" ? "Todas las familias" : `@${n.targetStudent}`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{n.content}</p>
                        <span className="text-[10px] text-slate-400 block pt-1">{n.date}</span>
                      </div>

                      <button onClick={() => handleDeleteNotice(n.id)} className="p-1.5 text-slate-400 hover:text-rose-600 transition" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Previsualizaciones */}
                    {(n.linkUrl || n.fileData) && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200/60">
                        {n.linkUrl && (
                          <a href={n.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold hover:bg-blue-100 transition">
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{n.linkTitle || "Abrir enlace"}</span>
                          </a>
                        )}
                        {n.fileData && (
                          <a href={n.fileData} download={n.fileName || "adjunto.pdf"} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold hover:bg-emerald-100 transition">
                            <Download className="w-3.5 h-3.5" />
                            <span>Descargar PDF ({n.fileName})</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Editar Usuario */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-800" />
                <h3 className="font-serif text-lg text-slate-900">Editar Usuario</h3>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre completo</label>
                <input type="text" value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-medium text-slate-900 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario</label>
                <input type="text" value={editingUser.username} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-medium text-slate-900 focus:outline-none" />
              </div>
              <p className="text-[11px] text-slate-500">La contraseña se gestiona por separado con el botón «Contraseña» de la lista. No se puede consultar ni editar desde este formulario.</p>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Rol asignado</label>
                <select value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })} className="w-full p-3 rounded-2xl border border-slate-200 bg-[#F7F6F3] text-xs font-semibold text-slate-900 focus:outline-none">
                  <option value="alumno">Alumno</option>
                  <option value="mentor">Mentor</option>
                  <option value="padre">Padre / Madre</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" onClick={() => setMsg(null)} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-1.5 shadow-sm">
                  <Save className="w-3.5 h-3.5" /> Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Pago */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-serif text-lg text-slate-900 font-bold">Editar / Actualizar Pago</h3>
              <button onClick={() => setEditingPayment(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleUpdatePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Concepto</label>
                <input type="text" value={editingPayment.concept} onChange={(e) => setEditingPayment({ ...editingPayment, concept: e.target.value })} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
              </div>
              <div>
                <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Importe (€)</label>
                <input type="number" value={editingPayment.amount} onChange={(e) => setEditingPayment({ ...editingPayment, amount: Number(e.target.value) })} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
              </div>
              <div>
                <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                <input type="text" value={editingPayment.dueDate} onChange={(e) => setEditingPayment({ ...editingPayment, dueDate: e.target.value })} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
              </div>
              <div>
                <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Enlace de Pago (Actualizable)</label>
                <input type="text" value={editingPayment.payLink} onChange={(e) => setEditingPayment({ ...editingPayment, payLink: e.target.value })} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl" required />
              </div>
              <div>
                <label className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Estado</label>
                <select value={editingPayment.status} onChange={(e) => setEditingPayment({ ...editingPayment, status: e.target.value as any })} className="w-full p-2.5 bg-[#FAF8F5] border border-slate-200 rounded-xl">
                  <option value="Pendiente">Pendiente</option>
                  <option value="Pagado">Pagado</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingPayment(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition">
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}