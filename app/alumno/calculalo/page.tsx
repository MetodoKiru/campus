'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function CalculaloPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1E293B] font-sans px-4 sm:px-6 md:px-10 py-6 md:py-10">
      <div className="max-w-4xl mx-auto">
        
        {/* Cabecera con botón de apagado en negro (Opción A) */}
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-serif text-[#0F172A]">Campus Método Kiru</h1>
            <span className="text-xs text-slate-500 font-medium">Panel del Alumno</span>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }}
            title="Cerrar sesión"
            className="p-2 sm:p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 transition-colors flex items-center justify-center shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-900">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        </div>

        {/* Navegación por pestañas */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-8 p-2 flex flex-wrap gap-2">
          <Link href="/alumno" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Inicio
          </Link>
          <Link href="/alumno/tareas" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Tareas
          </Link>
          <Link href="/alumno" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Progreso
          </Link>
          <Link href="/alumno" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Perfil
          </Link>
          <Link href="/alumno/calculalo" className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white shadow-sm transition">
            Calcúlalo
          </Link>
        </div>

        {/* Sección Calcúlalo */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-serif text-[#0F172A] mb-4">Calcúlalo</h2>

          <div className="bg-[#FDFBF7] p-5 sm:p-6 rounded-2xl border border-slate-100 mb-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Cómo acceder</h3>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600">
              <li>Pulsa «Accede».</li>
              <li>Accede como alumno.</li>
              <li>Usa tu código de clase y tu PIN.</li>
            </ol>
          </div>

          <a
            href="https://calculalo.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-sm"
          >
            Acceder a Calcúlalo
          </a>
        </div>

      </div>
    </div>
  );
}