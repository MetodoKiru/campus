'use client'

import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function PortalCandidato() {
  const params = useParams();
  const idCapturado = params.token || params.id; 

  const [candidato, setCandidato] = useState(null);
  const [mensajeError, setMensajeError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function buscarCandidato() {
      if (!idCapturado) return;

      const { data, error } = await supabase
        .from('candidatos')
        .select('*')
        .eq('token', idCapturado)
        .single();

      if (error || !data) {
        const { data: dataId, error: errorId } = await supabase
          .from('candidatos')
          .select('*')
          .eq('id', idCapturado)
          .single();
          
        if (errorId || !dataId) {
            setMensajeError("Candidatura no encontrada. Por favor, comprueba que el enlace es correcto.");
        } else {
            setCandidato(dataId);
        }
      } else {
        setCandidato(data);
      }
      setCargando(false);
    }
    
    buscarCandidato();
  }, [idCapturado]);

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f6f2] font-serif text-[#111]">
      <div className="animate-pulse text-xl">Buscando candidatura...</div>
    </div>
  );

  if (mensajeError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f6f2] p-4 font-serif text-[#111]">
        <div className="bg-white p-10 rounded-[28px] shadow-[0_10px_25px_rgba(0,0,0,0.04)] max-w-md w-full text-center">
          <h2 className="text-4xl font-normal mb-4 tracking-tight">Ups...</h2>
          <p className="text-lg opacity-85">{mensajeError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2] py-12 px-4 flex items-center justify-center font-serif text-[#111]">
      <div className="max-w-md w-full bg-white rounded-[28px] shadow-[0_10px_25px_rgba(0,0,0,0.04)] overflow-hidden">
        
        <div className="px-8 pt-10 pb-6 text-center border-b border-[#ececec]">
          <p className="uppercase tracking-[2px] text-[12px] opacity-50 mb-4 font-sans">Método Kiru</p>
          <h1 className="text-4xl font-normal tracking-[-1px] leading-none mb-2">Portal del Candidato</h1>
        </div>
        
        <div className="p-8">
          <div className="mb-8 text-center">
            <p className="text-[18px] opacity-85 leading-relaxed mb-1">Candidatura de</p>
            <p className="text-3xl font-normal">{candidato.nombre}</p>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between p-4 bg-[#f1f1ee] rounded-2xl">
              <span className="text-[16px]">Fase del proceso</span>
              <span className="px-6 py-2 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90">
                Fase {candidato.fase}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-[#f1f1ee] rounded-2xl">
              <span className="text-[16px]">Estado actual</span>
              <span className="px-6 py-2 border border-[#111] text-[#111] rounded-full text-sm font-sans transition hover:bg-[#111] hover:text-white">
                {candidato.estado}
              </span>
            </div>
          </div>

          
          {Number(candidato.fase) >= 2 && Number(candidato.fase) <= 4 && candidato.estado !== 'No seleccionado' && (
            <div className="mt-8 pt-8 border-t border-[#ececec] space-y-4">
              <h3 className="text-xl font-normal mb-4">Accesos a tu formación</h3>
              <div className="flex flex-col gap-3">
                
                
                {Number(candidato.fase) < 4 && (
                  <>
                    <a 
                      href="https://chat.whatsapp.com/IeXEH4ASw08A2tgwcj5p1W?mode=gi_t" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full px-6 py-4 bg-[#25D366] text-white rounded-full text-center text-sm font-sans font-medium transition hover:opacity-90"
                    >
                      Unirme al grupo de WhatsApp
                    </a>

                    <a 
                      href="https://classroom.google.com/c/ODc3MTgzNjE0OTQ0?cjc=rnupwla2" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full px-6 py-4 bg-[#4285F4] text-white rounded-full text-center text-sm font-sans font-medium transition hover:opacity-90"
                    >
                      Classroom: Formación Inicial
                    </a>
                  </>
                )}

                {/* Este botón se queda en solitario al llegar a la Fase 4 (y se oculta después) */}
                {Number(candidato.fase) === 4 && (
                  <a 
                    href="https://classroom.google.com/c/ODc3Njk4MDM1ODAz?cjc=4q5hqks5" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full px-6 py-4 bg-[#111] text-white rounded-full text-center text-sm font-sans font-medium transition hover:opacity-90"
                  >
                    Classroom: Metodología Kiru
                  </a>
                )}
              </div>
            </div>
          )}

          
          {(candidato.proximo_paso || candidato.instrucciones) && (
            <div className="mt-8 pt-8 border-t border-[#ececec]">
              <h3 className="text-xl font-normal mb-4">Siguiente paso</h3>
              
              <div className="bg-[#f7f6f2] p-6 rounded-2xl border border-[#ececec]">
                {candidato.instrucciones && (
                  <p className="text-[16px] leading-relaxed opacity-85 mb-5">
                    {candidato.instrucciones}
                  </p>
                )}
                
                {candidato.enlace && candidato.proximo_paso && (
                  <a 
                    href={candidato.enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center px-6 py-4 bg-[#111] text-white rounded-full text-sm font-sans font-medium transition hover:opacity-90"
                  >
                    {candidato.proximo_paso.toUpperCase()}
                  </a>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}