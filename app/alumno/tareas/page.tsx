'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function TareasPage() {
  const router = useRouter();
  const [inActivity, setInActivity] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const resetTask = () => {
    setInActivity(false);
    setSelectedAnswer(null);
    setIsFinished(false);
  };

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

        {/* Navegación por rutas */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-8 p-2 flex flex-wrap gap-2">
          <Link href="/alumno" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Inicio
          </Link>
          <Link href="/alumno/tareas" className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white shadow-sm transition">
            Tareas
          </Link>
          <Link href="/alumno" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Progreso
          </Link>
          <Link href="/alumno" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Perfil
          </Link>
          <Link href="/alumno/calculalo" className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Calcúlalo
          </Link>
        </div>

        {/* Pantalla de tareas y actividad interactiva */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
          {!inActivity ? (
            <div>
              <h2 className="text-xl sm:text-2xl font-serif text-[#0F172A] mb-6">Tareas Asignadas</h2>
              <div className="p-5 sm:p-6 border border-slate-100 rounded-2xl bg-[#FDFBF7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    INGLÉS
                  </span>
                  <h3 className="text-lg sm:text-xl font-serif text-slate-900 mt-1">
                    Unit 1 · Vocabulary
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    10 ejercicios · Dificultad: Media
                  </p>
                </div>
                <button
                  onClick={() => setInActivity(true)}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
                >
                  Comenzar
                </button>
              </div>
            </div>
          ) : !isFinished ? (
            <div>
              <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Vocabulary · Unit 1
                </span>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  Pregunta 1/10
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-serif text-slate-900 mb-6">
                Choose the correct answer:
              </h3>

              <div className="space-y-3 mb-6">
                {['Answer A', 'Answer B', 'Answer C', 'Answer D'].map((ans) => (
                  <button
                    key={ans}
                    onClick={() => setSelectedAnswer(ans)}
                    className={`w-full p-4 rounded-xl border text-sm text-left transition ${
                      selectedAnswer === ans
                        ? 'border-slate-900 bg-slate-50 font-bold text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {ans}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  if (selectedAnswer) setIsFinished(true);
                }}
                disabled={!selectedAnswer}
                className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 transition"
              >
                Siguiente
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <h3 className="text-xl sm:text-2xl font-serif text-slate-900 mb-2">
                Resultado de la actividad
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                Has completado la actividad correctamente. Puntuación obtenida:{' '}
                <span className="font-bold text-slate-900">8/10</span>
              </p>
              <button
                onClick={resetTask}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
              >
                Volver a Tareas
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}