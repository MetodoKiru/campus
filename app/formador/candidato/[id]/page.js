'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PHASE_ACTIONS = {
  1: { action: 'aprobar_fase1', label: 'Aprobar fase 1 y pasar a formación' },
  2: { action: 'aprobar_fase2', label: 'Aprobar fase 2 y pasar a entrevista' },
  3: { action: 'aprobar_fase3', label: 'Aprobar entrevista y pasar a metodología' },
  4: { action: 'aprobar_fase4', label: 'Aprobar metodología y pasar a incorporación' },
  5: { action: 'aprobar_fase5', label: 'Completar proceso y activar mentor' },
}

export default function PerfilCandidato() {
  const params = useParams()
  const id = String(params.id || '')
  const router = useRouter()
  const [token, setToken] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [portalLink, setPortalLink] = useState('')
  const [creatingPortalLink, setCreatingPortalLink] = useState(false)

  const loadCandidate = useCallback(async (accessToken) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/formador/candidatos/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la candidatura.')
      setCandidate(result.candidate)
      setNotes(result.candidate.notes || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la candidatura.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    let alive = true
    async function init() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      if (authError || !user || !session?.access_token) {
        router.replace('/')
        return
      }
      if (alive) setToken(session.access_token)
      await loadCandidate(session.access_token)
    }
    void init()
    return () => { alive = false }
  }, [router, loadCandidate])

  async function updateCandidate(action) {
    if (!token || saving) return
    if (action !== 'guardar_observaciones' && !window.confirm('¿Confirmas este cambio de fase de la candidatura?')) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/formador/candidatos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(action === 'guardar_observaciones' ? { action, notes } : { action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el cambio.')
      setCandidate(result.candidate)
      setNotes(result.candidate.notes || '')
      setMessage(action === 'guardar_observaciones' ? 'Observaciones guardadas.' : 'Cambio de fase guardado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.')
    } finally {
      setSaving(false)
    }
  }

  async function generatePortalLink() {
    if (!token || creatingPortalLink) return
    if (!window.confirm('Generar un enlace nuevo invalidará el enlace anterior de esta candidatura. ¿Continuar?')) return
    setCreatingPortalLink(true)
    setError('')
    setMessage('')
    setPortalLink('')
    try {
      const response = await fetch(`/api/formador/candidatos/${encodeURIComponent(id)}/portal-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo generar el enlace del candidato.')
      setPortalLink(result.portalUrl)
      try {
        await navigator.clipboard.writeText(result.portalUrl)
        setMessage('Enlace seguro generado y copiado. Guarda este enlace: el token solo se muestra ahora.')
      } catch {
        setMessage('Enlace seguro generado. Copia el enlace que aparece abajo; el token solo se muestra ahora.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el enlace del candidato.')
    } finally {
      setCreatingPortalLink(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#F7F6F3] text-sm text-slate-500">Cargando ficha…</main>

  if (!candidate) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6">
          <h1 className="text-xl font-semibold">No se ha podido abrir la candidatura</h1>
          <p role="alert" className="mt-3 text-sm text-rose-800">{error || 'Candidatura no encontrada.'}</p>
          <Link href="/formador" className="mt-5 inline-block text-sm font-semibold text-emerald-800 underline">Volver al panel</Link>
        </div>
      </main>
    )
  }

  const finalised = candidate.status === 'No seleccionado' || candidate.status === 'Activo'
  const phaseAction = PHASE_ACTIONS[Number(candidate.phase)]

  return (
    <main className="min-h-screen bg-[#F7F6F3] px-4 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <Link href="/formador" className="text-sm font-medium text-emerald-800 underline underline-offset-4">← Volver a candidaturas</Link>
            <h1 className="mt-4 font-serif text-3xl font-semibold">{candidate.name}</h1>
            <p className="mt-2 text-sm text-slate-600">Fase {candidate.phase} · {candidate.status}</p>
          </div>
          <button type="button" onClick={signOut} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Cerrar sesión</button>
        </header>

        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Seguimiento</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado en Google Sheets</dt><dd className="mt-2 text-sm">{candidate.sheet_status || 'Sin estado en la hoja'}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Próximo paso</dt><dd className="mt-2 text-sm">{candidate.next_step || 'Sin próximo paso definido'}</dd></div>
          </dl>
          {candidate.instructions && <p className="mt-4 rounded-xl border border-slate-200 p-4 text-sm leading-6">{candidate.instructions}</p>}
          {candidate.calendly_url && <a href={candidate.calendly_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-emerald-800 underline">Abrir enlace de entrevista en Calendly</a>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Observaciones internas</h2>
          <label htmlFor="candidate-notes" className="sr-only">Observaciones</label>
          <textarea id="candidate-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} rows={5} className="mt-4 w-full rounded-xl border border-slate-300 p-4 text-sm leading-6 outline-none focus:border-emerald-700" placeholder="Anota el seguimiento de esta candidatura…" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{notes.length}/5000 caracteres</span>
            <button type="button" onClick={() => updateCandidate('guardar_observaciones')} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar observaciones'}</button>
          </div>
        </section>

        {!finalised && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Acciones de fase</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Los cambios se guardan en el Campus y se añaden al historial de la candidatura.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {phaseAction && <button type="button" onClick={() => updateCandidate(phaseAction.action)} disabled={saving} className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{phaseAction.label}</button>}
              <button type="button" onClick={() => updateCandidate('descartar')} disabled={saving} className="rounded-xl border border-rose-300 px-4 py-3 text-sm font-semibold text-rose-800 disabled:opacity-60">Descartar candidatura</button>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Enlace del portal del candidato</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Genera un enlace personal para que la persona candidata pueda consultar su fase y las instrucciones. Por seguridad, el enlace anterior se invalida y el token nuevo solo se muestra una vez.
          </p>
          <button type="button" onClick={generatePortalLink} disabled={creatingPortalLink} className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {creatingPortalLink ? 'Generando enlace…' : 'Generar / renovar enlace'}
          </button>
          {portalLink && <div className="mt-4 break-all rounded-xl bg-slate-50 p-4 text-sm"><a href={portalLink} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">{portalLink}</a></div>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Historial</h2>
          {Array.isArray(candidate.history) && candidate.history.length ? (
            <ol className="mt-4 space-y-3">
              {[...candidate.history].reverse().map((entry, index) => (
                <li key={entry.at || index} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-medium">{entry.message || entry.action || 'Cambio registrado'}</p>
                  <p className="mt-1 text-xs text-slate-500">{entry.at ? new Date(entry.at).toLocaleString('es-ES') : 'Fecha no disponible'}{entry.phase ? ` · Fase ${entry.phase}` : ''}</p>
                </li>
              ))}
            </ol>
          ) : <p className="mt-3 text-sm text-slate-500">Todavía no hay cambios registrados.</p>}
        </section>
      </div>
    </main>
  )
}
