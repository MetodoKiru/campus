'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function PanelFormador() {
  const [candidatos, setCandidatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  
  const [calendly, setCalendly] = useState("")
  const [mostrandoCalendly, setMostrandoCalendly] = useState(false)
  const [guardandoCalendly, setGuardandoCalendly] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    async function cargarDatos() {
      // 1. Verificamos la sesión de Supabase
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        router.push('/') // Vuelve a la portada si no está logueado
        return
      }

      // 2. Cargamos el enlace de Calendly personal
      const { data: formador } = await supabase
        .from('formadores')
        .select('enlace_calendly')
        .eq('email', user.email)
        .single()

      if (formador && formador.enlace_calendly) {
        setCalendly(formador.enlace_calendly)
      }

      // 3. Cargamos los candidatos desde la API secreta (Robot de Google)
      try {
        const respuesta = await fetch('/api/candidatos')
        
        if (!respuesta.ok) {
           console.error("La API devolvió error:", respuesta.status);
           setCargando(false);
           return;
        }

        const datos = await respuesta.json()
        
        if (datos && datos.candidatos && datos.candidatos.length > 0) {
          // Filtramos a los candidatos para quitar los comentarios y celdas basura de Sheets
          const candidatosReales = datos.candidatos.filter(c => {
             // Solo dejamos pasar filas que tengan nombre y que NO sean los comentarios de prueba
             return c.nombre 
               && c.nombre.trim() !== "" 
               && c.nombre.toLowerCase() !== "desconocido" 
               && !c.nombre.toLowerCase().includes("elige pasa o no pasa");
          });
          
          setCandidatos(candidatosReales)
        } else {
          console.log("La API respondió, pero no hay candidatos válidos.", datos);
        }
      } catch (error) {
        console.error("Error al pedir datos a la API en el cliente:", error)
      }
      
      setCargando(false)
    }

    cargarDatos()
  }, [router])

  // EL MODELO HÍBRIDO: Sincroniza Sheets con Supabase antes de abrir la ficha
  const abrirFicha = async (candidatoSheet) => {
    setSincronizando(true)
    
    // Buscamos si ya lo hemos copiado antes usando su nombre
    const { data: existente } = await supabase
      .from('candidatos')
      .select('id')
      .eq('nombre', candidatoSheet.nombre)
      .single()

    let idParaRuta = null;

    if (existente) {
      idParaRuta = existente.id
    } else {
      // Si es la primera vez que abres su ficha, lo copiamos a Supabase
      const tokenSeguro = candidatoSheet.nombre.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000)
      
      const { data: nuevo, error } = await supabase
        .from('candidatos')
        .insert({
          nombre: candidatoSheet.nombre,
          estado: candidatoSheet.estado,
          fase: Number(candidatoSheet.fase) || 1,
          token: tokenSeguro
        })
        .select('id')
        .single()

      if (error) {
        alert("Error al sincronizar con la base de datos: " + error.message)
        setSincronizando(false)
        return
      }
      idParaRuta = nuevo.id
    }

    // Asegúrate de que esta ruta coincida con el nombre de tu carpeta. Si la dejaste como 'panel', cámbiala a `/panel/candidato/${idParaRuta}`
    router.push(`/formador/candidato/${idParaRuta}`)
  }

  const guardarCalendly = async () => {
    if (calendly !== null && calendly.trim() !== "") {
      setGuardandoCalendly(true)
      const { data: { user } } = await supabase.auth.getUser()
      
      await supabase
        .from('formadores')
        .update({ enlace_calendly: calendly.trim() })
        .eq('email', user.email)
      
      setGuardandoCalendly(false)
      setMostrandoCalendly(false)
      alert("¡Enlace de Calendly guardado correctamente!")
    } else {
        alert("El enlace no puede estar vacío.")
    }
  }

  const handleCerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (cargando) return <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center font-serif">Cargando datos de Sheets...</div>

  return (
    <div className="min-h-screen bg-[#f7f6f2] font-serif text-[#111]">
      <nav className="bg-white px-8 py-4 flex flex-wrap justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.03)] border-b border-[#ececec]">
        <div className="flex items-center gap-8">
          <span className="font-bold text-xl tracking-[-1px]">Panel Formadores</span>
          <div className="hidden sm:flex gap-3 font-sans text-sm">
            <a href="https://docs.google.com/spreadsheets/d/1Es3xB12WbGlXiw6Btzqbj5bPEz8U5bRf1_rEcTz25fk/edit?usp=sharing" target="_blank" rel="noopener noreferrer" className="px-5 py-2 bg-[#f1f1ee] rounded-full hover:bg-[#e4e4e0] transition">
              Google Sheets
            </a>
            <a href="https://classroom.google.com" target="_blank" rel="noopener noreferrer" className="px-5 py-2 bg-[#f1f1ee] rounded-full hover:bg-[#e4e4e0] transition">
              Classroom
            </a>
          </div>
        </div>
        <button onClick={handleCerrarSesion} className="px-6 py-2 border border-[#111] rounded-full text-sm font-sans font-medium hover:bg-[#111] hover:text-white transition">
          Cerrar sesión
        </button>
      </nav>

      <main className="max-w-6xl mx-auto py-12 px-6">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-4xl font-normal mb-2 tracking-[-1px]">Mis Candidatos</h1>
           
          </div>
          
          <button 
            onClick={() => setMostrandoCalendly(true)}
            className="text-sm font-sans underline opacity-60 hover:opacity-100 transition"
          >
            {calendly ? "Modificar link Calendly" : "Configurar link Calendly"}
          </button>
        </div>

        <div className="bg-white rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.04)] overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans min-w-[700px]">
            <thead>
              <tr className="bg-[#f1f1ee] text-[15px]">
                <th className="p-6 font-semibold">Candidato</th>
                <th className="p-6 font-semibold">Estado en Sheets</th>
                <th className="p-6 font-semibold">Fase</th>
                <th className="p-6 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.map((c) => (
                <tr key={c.id_temporal} className="border-t border-[#ececec] hover:bg-[#fafaf9] transition">
                  <td className="p-6 font-medium text-[16px]">{c.nombre}</td>
                  <td className="p-6">
                    <span className="px-4 py-1.5 border border-[#111] text-[#111] rounded-full text-xs font-bold uppercase tracking-wider">{c.estado}</span>
                  </td>
                  <td className="p-6">
                    <span className="px-4 py-1.5 bg-[#111] text-white rounded-full text-xs font-bold uppercase tracking-wider">Fase {c.fase}</span>
                  </td>
                  <td className="p-6 text-right">
                    <button 
                      onClick={() => abrirFicha(c)}
                      disabled={sincronizando}
                      className="px-5 py-2.5 bg-transparent border border-[#ececec] text-[#111] rounded-full text-sm font-medium hover:border-[#111] transition inline-block disabled:opacity-50"
                    >
                      {sincronizando ? "Copiando..." : "Abrir Ficha"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      
      {mostrandoCalendly && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative">
            <button onClick={() => setMostrandoCalendly(false)} className="absolute top-4 right-5 text-gray-400 hover:text-black font-sans text-xl">✕</button>
            <h2 className="text-2xl font-normal mb-2">Tu enlace de Calendly</h2>
            <p className="text-sm font-sans opacity-70 mb-6">Este enlace se inyectará al candidato al pasar a Fase 3.</p>
            <input 
              type="text" 
              value={calendly}
              onChange={(e) => setCalendly(e.target.value)}
              placeholder="https://calendly.com/tu-link"
              className="w-full p-4 mb-6 rounded-xl border border-[#ececec] bg-[#f7f6f2] font-sans text-sm focus:outline-none focus:border-[#111]"
            />
            <div className="flex gap-3">
              <button onClick={() => setMostrandoCalendly(false)} className="flex-1 px-4 py-3 bg-transparent border border-[#ececec] text-[#111] rounded-full text-sm font-sans hover:bg-[#f1f1ee] transition">Cancelar</button>
              <button onClick={guardarCalendly} disabled={guardandoCalendly} className="flex-1 px-4 py-3 bg-[#111] text-white rounded-full text-sm font-sans transition hover:opacity-90 disabled:opacity-50">Guardar enlace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}