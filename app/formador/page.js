'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

async function authorizedFetch(path, token, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  })
}

export default function FormadorPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [name, setName] = useState('Formador')
  const [token, setToken] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [candidateError, setCandidateError] = useState('')
  const [candidateMessage, setCandidateMessage] = useState('')
  const [calendlyUrl, setCalendlyUrl] = useState('')
  const [savingCalendly, setSavingCalendly] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')

  const loadCandidates = useCallback(async (accessToken) => {
    setLoadingCandidates(true)
    setCandidateError('')
    try {
      const response = await authorizedFetch('/api/formador/candidatos', accessToken)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las candidaturas.')
      setCandidates(Array.isArray(result.candidates) ? result.candidates : [])
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : 'No se pudieron cargar las candidaturas.')
    } finally {
      setLoadingCandidates(false)
    }
  }, [])

  const loadCalendly = useCallback(async (accessToken) => {
    try {
      const response = await authorizedFetch('/api/formador/perfil', accessToken)
      const result = await response.json()
      if (response.ok) setCalendlyUrl(typeof result.calendlyUrl === 'string' ? result.calendlyUrl : '')
    } catch {
      setProfileMessage('No se pudo cargar el enlace de Calendly.')
    }
  }, [])

  useEffect(() => {
    let alive = true
    async function verifyAccess() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          router.replace('/')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, role, is_active')
          .eq('id', user.id)
          .single()

        if (
          profileError ||
          !profile ||
          !profile.is_active ||
          profile.role !== 'formador' ||
          user.app_metadata?.kiru_role !== 'formador'
        ) {
          router.replace('/')
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          router.replace('/')
          return
        }

        if (alive) {
          setName(profile.full_name || 'Formador')
          setToken(session.access_token)
          setAuthorized(true)
        }
        await Promise.all([loadCandidates(session.access_token), loadCalendly(session.access_token)])
      } catch {
        router.replace('/')
      } finally {
        if (alive) setChecking(false)
      }
    }

    void verifyAccess()
    return () => { alive = false }
  }, [router, loadCandidates, loadCalendly])

  async function syncSheets() {
    if (!token || syncing) return
    setSyncing(true)
    setCandidateError('')
    setCandidateMessage('')
    try {
      const response = await authorizedFetch('/api/formador/candidatos', token, { method: 'POST', body: '{}' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo sincronizar Google Sheets.')
      setCandidates(Array.isArray(result.candidates) ? result.candidates : [])
      let summary = `Sincronización completada: ${Number(result.synced) || 0} filas procesadas.`
      if (Number(result.unstableRows) > 0) {
        summary += ` Aviso: ${Number(result.unstableRows)} filas no tienen identificador estable en Sheets; si se reordenan, podrían crear duplicados. Añade un identificador estable a esas filas.`
      }
      if (result.truncated) summary += ' Se alcanzó el límite de filas de esta ejecución.'
      setCandidateMessage(summary)
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : 'No se pudo sincronizar Google Sheets.')
    } finally {
      setSyncing(false)
    }
  }

  async function saveCalendly(event) {
    event.preventDefault()
    if (!token || savingCalendly) return
    setSavingCalendly(true)
    setProfileMessage('')
    try {
      const response = await authorizedFetch('/api/formador/perfil', token, {
        method: 'PATCH',
        body: JSON.stringify({ calendlyUrl }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el enlace.')
      setCalendlyUrl(result.calendlyUrl || '')
      setProfileMessage('Enlace de Calendly guardado.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'No se pudo guardar el enlace.')
    } finally {
      setSavingCalendly(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F7F6F3] text-sm text-slate-500">Comprobando permisos…</main>
  }

  if (!authorized) return null

  return (
    <main className="min-h-screen bg-[#F7F6F3] px-4 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">Método Kiru</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold">Panel de formadores</h1>
            <p className="mt-2 text-sm text-slate-600">Hola, {name}.</p>
          </div>
          <button type="button" onClick={signOut} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Cerrar sesión
          </button>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Enlace para entrevistas</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Guarda tu enlace de Calendly para añadirlo a las candidaturas cuando pasen a la fase de entrevista.</p>
          <form onSubmit={saveCalendly} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="formador-calendly" className="sr-only">Enlace de Calendly</label>
            <input id="formador-calendly" type="url" value={calendlyUrl} onChange={(event) => setCalendlyUrl(event.target.value)} placeholder="https://calendly.com/tu-enlace" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700" />
            <button type="submit" disabled={savingCalendly} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{savingCalendly ? 'Guardando…' : 'Guardar enlace'}</button>
          </form>
          {profileMessage && <p role="status" className="mt-3 text-sm text-slate-600">{profileMessage}</p>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Candidaturas</h2>
              <p className="mt-1 text-sm text-slate-600">La sincronización conserva las fases y observaciones guardadas en el Campus.</p>
            </div>
            <button type="button" onClick={syncSheets} disabled={syncing || !token} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {syncing ? 'Sincronizando…' : 'Sincronizar Google Sheets'}
            </button>
          </div>

          {candidateError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{candidateError}</p>}
          {candidateMessage && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{candidateMessage}</p>}

          {loadingCandidates ? (
            <p className="py-10 text-center text-sm text-slate-500">Cargando candidaturas…</p>
          ) : candidates.length === 0 ? (
            <p className="mt-5 rounded-xl bg-slate-50 p-6 text-sm leading-6 text-slate-600">Todavía no hay candidaturas sincronizadas. Pulsa «Sincronizar Google Sheets» para cargar las filas válidas.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Candidato</th><th className="px-3 py-3">Fase</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Sheets</th><th className="px-3 py-3">Ficha</th></tr></thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-4 font-medium">{candidate.name}</td>
                      <td className="px-3 py-4">Fase {candidate.phase}</td>
                      <td className="px-3 py-4">{candidate.status}</td>
                      <td className="px-3 py-4 text-slate-600">{candidate.sheet_status || '—'}</td>
                      <td className="px-3 py-4"><Link href={`/formador/candidato/${candidate.id}`} className="font-semibold text-emerald-800 underline underline-offset-4">Abrir ficha</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
