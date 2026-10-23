'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function PortalCandidato() {
  const params = useParams()
  const token = String(params.token || '')
  const [candidate, setCandidate] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function loadCandidate() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/mentores/candidatura/${encodeURIComponent(token)}`, { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudo consultar la candidatura.')
        if (alive) setCandidate(result.candidate)
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo consultar la candidatura.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    if (token) void loadCandidate()
    else { setError('Este enlace no es válido. Contacta con el equipo de selección para recibir uno actualizado.'); setLoading(false) }
    return () => { alive = false }
  }, [token])

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] font-serif text-[#111]"><p className="animate-pulse text-lg">Consultando el estado de tu candidatura…</p></main>
  }

  if (error || !candidate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] p-4 font-serif text-[#111]">
        <section className="w-full max-w-md rounded-[28px] bg-white p-10 text-center shadow-[0_10px_25px_rgba(0,0,0,0.04)]">
          <p className="mb-4 font-sans text-xs uppercase tracking-[2px] opacity-50">Método Kiru</p>
          <h1 className="mb-4 text-3xl font-normal">No se ha podido abrir el enlace</h1>
          <p role="alert" className="text-base leading-relaxed opacity-85">{error || 'Candidatura no encontrada.'}</p>
        </section>
      </main>
    )
  }

  const phase = Number(candidate.phase)
  const status = candidate.status || 'Pendiente'
  const canAccessTraining = phase >= 2 && phase <= 4 && status !== 'No seleccionado'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] px-4 py-12 font-serif text-[#111]">
      <section className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.04)]">
        <header className="border-b border-[#ececec] px-8 pb-7 pt-10 text-center">
          <p className="mb-4 font-sans text-xs uppercase tracking-[2px] opacity-50">Método Kiru</p>
          <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">Portal de candidatura</h1>
          <p className="mt-3 text-base opacity-75">Estado del proceso de selección</p>
        </header>

        <div className="p-8">
          <div className="mb-8 text-center">
            <p className="mb-1 text-sm opacity-65">Candidatura de</p>
            <p className="text-2xl font-normal">{candidate.name}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f1f1ee] p-4">
              <span className="text-sm">Fase del proceso</span>
              <span className="rounded-full bg-[#111] px-4 py-2 font-sans text-xs text-white">Fase {phase}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f1f1ee] p-4">
              <span className="text-sm">Estado actual</span>
              <span className="rounded-full border border-[#111] px-4 py-2 font-sans text-xs">{status}</span>
            </div>
          </div>

          {canAccessTraining && (
            <section className="mt-8 space-y-3 border-t border-[#ececec] pt-8">
              <h2 className="mb-4 text-xl font-normal">Accesos a tu formación</h2>
              {phase < 4 && (
                <>
                  <a href="https://chat.whatsapp.com/IeXEH4ASw08A2tgwcj5p1W?mode=gi_t" target="_blank" rel="noopener noreferrer" className="block w-full rounded-full bg-[#25D366] px-6 py-4 text-center font-sans text-sm font-medium text-white hover:opacity-90">Unirme al grupo de WhatsApp</a>
                  <a href="https://classroom.google.com/c/ODc3MTgzNjE0OTQ0?cjc=rnupwla2" target="_blank" rel="noopener noreferrer" className="block w-full rounded-full bg-[#4285F4] px-6 py-4 text-center font-sans text-sm font-medium text-white hover:opacity-90">Classroom: Formación Inicial</a>
                </>
              )}
              {phase === 4 && <a href="https://classroom.google.com/c/ODc3Njk4MDM1ODAz?cjc=4q5hqks5" target="_blank" rel="noopener noreferrer" className="block w-full rounded-full bg-[#111] px-6 py-4 text-center font-sans text-sm font-medium text-white hover:opacity-90">Classroom: Metodología Kiru</a>}
            </section>
          )}

          {(candidate.instructions || candidate.next_step || candidate.calendly_url) && (
            <section className="mt-8 border-t border-[#ececec] pt-8">
              <h2 className="mb-4 text-xl font-normal">Siguiente paso</h2>
              <div className="space-y-4 rounded-2xl border border-[#ececec] bg-[#f7f6f2] p-6">
                {candidate.instructions && <p className="text-base leading-relaxed opacity-85">{candidate.instructions}</p>}
                {candidate.next_step && <p className="font-sans text-xs font-semibold uppercase tracking-wide">{candidate.next_step}</p>}
                {candidate.calendly_url && <a href={candidate.calendly_url} target="_blank" rel="noopener noreferrer" className="block w-full rounded-full bg-[#111] px-6 py-4 text-center font-sans text-sm font-medium text-white hover:opacity-90">Programar entrevista</a>}
              </div>
            </section>
          )}

          {status === 'No seleccionado' && <p className="mt-8 rounded-2xl bg-[#f7f6f2] p-5 text-center text-sm leading-relaxed opacity-80">El proceso de selección ha finalizado. Muchas gracias por tu interés en Método Kiru.</p>}
          <p className="mt-8 text-center font-sans text-[11px] leading-5 text-slate-400">Este enlace es personal. Si crees que ha llegado a otra persona, contacta con el equipo de selección para que lo renueve.</p>
        </div>
      </section>
    </main>
  )
}
