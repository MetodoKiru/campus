'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function PerfilCandidato({ params }) {
  const { id } = use(params);
  const [candidato, setCandidato] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [observaciones, setObservaciones] = useState("")
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function cargarCandidato() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }

      const { data } = await supabase
        .from('candidatos')
        .select('*')
        .eq('id', id)
        .single()

      if (data) {
        setCandidato(data)
        setObservaciones(data.observaciones || "")
      }
      setCargando(false)
    }
    cargarCandidato()
  }, [id, router])

  const guardarObservaciones = async () => {
    setGuardando(true)
    await supabase.from('candidatos').update({ observaciones: observaciones }).eq('id', id)
    setCandidato({ ...candidato, observaciones: observaciones })
    setGuardando(false)
    alert("Observaciones guardadas correctamente")
  }

  const tomarDecision = async (nuevaFase, nuevoEstado, accion) => {
    if (!confirm(`¿Estás seguro de cambiar el estado a: ${nuevoEstado}?`)) return;
    setGuardando(true)
    let datosActualizar = { fase: nuevaFase, estado: nuevoEstado }
    
    // AUTO-HISTORIAL
    const fechaHoy = new Date().toLocaleDateString('es-ES');
    let registroHistorial = "";

    if (accion === "aprobar_fase1") {
      datosActualizar.instrucciones = "¡Felicidades! Has superado la revisión inicial. El siguiente paso es acceder a la formación."
      datosActualizar.proximo_paso = "ACCEDER A LA FORMACIÓN"
      registroHistorial = `${fechaHoy} - Supera Fase 1 (Revisión). Pasa a Formación.`;
    } 
    else if (accion === "aprobar_fase2") {
      datosActualizar.instrucciones = "¡Enhorabuena! Has superado la formación. El próximo paso será realizar una entrevista personal."
      datosActualizar.proximo_paso = "PROGRAMAR ENTREVISTA"
      registroHistorial = `${fechaHoy} - Supera Fase 2 (Formación). Pasa a Entrevistas.`;
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        alert("⚠️ Error: No detecta tu sesión de usuario. (Posible sesión caducada)");
      } else {
        const { data: formador, error: formadorError } = await supabase
          .from('formadores')
          .select('enlace_calendly')
          .eq('email', user.email)
          .single();
          
        if (formadorError) {
          alert("⚠️ Supabase no te encuentra en la tabla formadores: " + formadorError.message);
        } else if (formador && formador.enlace_calendly) {
          datosActualizar.enlace = formador.enlace_calendly;
          alert("✅ ¡Éxito! Enlace copiado de tu perfil: " + formador.enlace_calendly);
        } else {
          alert("⚠️ Estás en la tabla de formadores, pero tu columna enlace_calendly está vacía.");
        }
      }
    }
    else if (accion === "aprobar_fase3") {
      datosActualizar.instrucciones = "¡Entrevista superada con éxito! Accede al siguiente nivel en Classroom."
      datosActualizar.proximo_paso = "METODOLOGÍA KIRU"
      datosActualizar.enlace = ""
      registroHistorial = `${fechaHoy} - Supera Fase 3 (Entrevista). Pasa a Metodología.`;
    }
    else if (accion === "aprobar_fase4") {
      datosActualizar.instrucciones = "¡Felicidades! Has completado con éxito la Metodología Kiru. El equipo se pondrá en contacto contigo para los siguientes pasos de tu incorporación."
      datosActualizar.proximo_paso = "INICIAR INCORPORACIÓN"
      datosActualizar.enlace = "" 
      registroHistorial = `${fechaHoy} - Supera Fase 4 (Metodología). Pasa a Fase 5 (Incorporación).`;
    }
    else if (accion === "aprobar_fase5") {
      datosActualizar.instrucciones = "¡Enhorabuena! Has sido declarado APTO en la entrevista final. Nos pondremos en contacto contigo muy pronto para completar la documentación y organizar tu incorporación oficial como mentor."
      datosActualizar.proximo_paso = "PROCESO COMPLETADO"
      datosActualizar.enlace = ""
      registroHistorial = `${fechaHoy} - Supera Fase 5 (Entrevista Final). Pasa a Fase 6 (Incorporación).`;
    }
    else if (accion === "descartar") {
      datosActualizar.instrucciones = "El proceso de selección para esta candidatura ha finalizado. Muchas gracias por tu tiempo."
      datosActualizar.proximo_paso = ""
      datosActualizar.enlace = ""
      registroHistorial = `${fechaHoy} - Candidatura descartada en Fase ${candidato.fase}.`;
    }

    const historialViejo = candidato.historial ? candidato.historial + "\n" : "";
    datosActualizar.historial = historialViejo + registroHistorial;

    const { error: updateError } = await supabase.from('candidatos').update(datosActualizar).eq('id', id);
    
    if (updateError) {
      alert("⚠️ Supabase bloqueó el guardado final en la tabla de candidatos: " + updateError.message);
    } else {
      setCandidato({ ...candidato, ...datosActualizar });
    }
    
    setGuardando(false)
  }
  
  if (cargando) return <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center font-serif">Cargando ficha...</div>
  if (!candidato) return <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center font-serif">Candidato no encontrado</div>

  const faseActual = Number(candidato.fase);

  return (
    <div className="min-h-screen bg-[#f7f6f2] font-serif text-[#111] py-12 px-6">
      <div className="max-w-5xl mx-auto">
        <a href="/formador" className="text-sm font-sans underline opacity-60 hover:opacity-100 mb-8 inline-block">← Volver a Mis Candidatos</a>

        <div className="bg-white rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          
          <div className="p-8 border-b border-[#ececec] flex flex-wrap justify-between items-center gap-6">
            <div>
              <h1 className="text-3xl font-normal mb-2">{candidato.nombre}</h1>
              <p className="text-sm font-sans opacity-70">{candidato.email || "Sin email"} | {candidato.telefono || "Sin teléfono"}</p>
            </div>
            <div className="flex gap-3">
              <span className="px-4 py-2 border border-[#111] rounded-full text-xs font-bold uppercase bg-[#f1f1ee]">{candidato.estado}</span>
              <span className="px-4 py-2 bg-[#111] text-white rounded-full text-xs font-bold uppercase">Fase {candidato.fase}</span>
            </div>
          </div>

          <div className="p-8 grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <h2 className="text-xl font-normal border-b border-[#ececec] pb-2">Información del Perfil</h2>
              <div><p className="text-sm font-sans opacity-60 mb-1">Nivel de matemáticas</p><p className="font-medium">{candidato.nivel_matematicas || "No especificado"}</p></div>
              <div><p className="text-sm font-sans opacity-60 mb-1">Zonas donde puede dar clase</p><p className="font-medium">{candidato.zonas || "No especificado"}</p></div>

              <div className="pt-4">
                <p className="text-sm font-sans opacity-60 mb-2">Historial del proceso</p>
                <div className="p-4 bg-[#f7f6f2] border border-[#ececec] rounded-xl text-sm font-sans whitespace-pre-wrap leading-relaxed">
                  {candidato.historial || "Sin registros previos."}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-normal border-b border-[#ececec] pb-2">Gestión del Proceso</h2>
                
                {candidato.estado === "No seleccionado" ? (
                  <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">Candidato descartado.</div>
                ) : faseActual === 1 ? (
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => tomarDecision(2, "Formación", "aprobar_fase1")} disabled={guardando} className="flex-1 px-4 py-3 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90">Aceptar (Fase 2)</button>
                    <button onClick={() => tomarDecision(1, "No seleccionado", "descartar")} disabled={guardando} className="flex-1 px-4 py-3 border border-red-500 text-red-600 rounded-full text-sm font-sans">Descartar</button>
                  </div>
                ) : faseActual === 2 ? (
                  <div className="space-y-4 mt-4">
                    <p className="text-sm font-sans opacity-60">Control de Fase 2: Formación Inicial</p>
                    <div className="flex gap-3">
                      <button onClick={() => tomarDecision(3, "Fase 3: Entrevistas", "aprobar_fase2")} disabled={guardando} className="flex-1 px-4 py-3 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90">Formación Superada</button>
                      <button onClick={() => tomarDecision(1, "No seleccionado", "descartar")} disabled={guardando} className="flex-1 px-4 py-3 border border-red-500 text-red-600 rounded-full text-sm font-sans">No Superada</button>
                    </div>
                  </div>
                ) : faseActual === 3 ? (
                  <div className="space-y-4 mt-4">
                    <p className="text-sm font-sans opacity-60">Control de Fase 3: Entrevista Personal</p>
                    <div className="flex gap-3">
                      <button onClick={() => tomarDecision(4, "Fase 4: Metodología Kiru", "aprobar_fase3")} disabled={guardando} className="flex-1 px-4 py-3 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90">Entrevista Superada</button>
                      <button onClick={() => tomarDecision(1, "No seleccionado", "descartar")} disabled={guardando} className="flex-1 px-4 py-3 border border-red-500 text-red-600 rounded-full text-sm font-sans">No Superada</button>
                    </div>
                  </div>
                ) : faseActual === 4 ? (
                  <div className="space-y-4 mt-4">
                    <p className="text-sm font-sans opacity-60">Control de Fase 4: Metodología Kiru</p>
                    <div className="flex gap-3">
                      <button onClick={() => tomarDecision(5, "Fase 5: Entrevista Final", "aprobar_fase4")} disabled={guardando} className="flex-1 px-4 py-3 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90">Metodología Superada</button>
                      <button onClick={() => tomarDecision(1, "No seleccionado", "descartar")} disabled={guardando} className="flex-1 px-4 py-3 border border-red-500 text-red-600 rounded-full text-sm font-sans">No Superada</button>
                    </div>
                  </div>  
                ) : faseActual === 5 ? (
                  <div className="space-y-4 mt-4">
                    <p className="text-sm font-sans opacity-60">Control de Fase 5: Entrevista Final</p>
                    <div className="flex gap-3">
                      <button onClick={() => tomarDecision(6, "Fase 6: Incorporación", "aprobar_fase5")} disabled={guardando} className="flex-1 px-4 py-3 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90">APTO (Incorporar)</button>
                      <button onClick={() => tomarDecision(1, "No seleccionado", "descartar")} disabled={guardando} className="flex-1 px-4 py-3 border border-red-500 text-red-600 rounded-full text-sm font-sans">NO APTO</button>
                    </div>
                  </div>
                ) : faseActual === 6 ? (
                  <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm font-sans border border-green-100">
                    🎉 Candidato aprobado y listo para incorporación (Fase 6).
                  </div>
                ) : (
                  <div className="p-4 bg-[#f1f1ee] rounded-xl text-sm font-sans">El candidato está en Fase {faseActual}.</div>
                )}
              </div>

              <div className="space-y-4 pt-4">
                <h2 className="text-xl font-normal border-b border-[#ececec] pb-2">Observaciones Internas</h2>
                <textarea className="w-full h-24 p-4 rounded-xl border border-[#ececec] bg-[#f7f6f2] font-sans text-sm focus:outline-none focus:border-[#111]" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Impresiones, notas..." />
                <button onClick={guardarObservaciones} disabled={guardando} className="px-6 py-3 bg-white border border-[#111] text-[#111] rounded-full text-sm font-sans transition hover:bg-[#111] hover:text-white disabled:opacity-50">
                  {guardando ? "Guardando..." : "Guardar notas"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}