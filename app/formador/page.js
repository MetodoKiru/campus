'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function FormadorPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [name, setName] = useState('Formador')

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

        if (alive) {
          setName(profile.full_name || 'Formador')
          setAuthorized(true)
        }
      } catch {
        router.replace('/')
      } finally {
        if (alive) setChecking(false)
      }
    }

    void verifyAccess()
    return () => { alive = false }
  }, [router])

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
      <div className="mx-auto max-w-4xl">
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

        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6" role="status">
          <h2 className="text-lg font-semibold text-amber-950">Acceso habilitado; conexión de candidaturas pendiente de validación</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Tu cuenta y el acceso al rol de formador ya se reconocen en el Campus. La lista de candidaturas todavía no se muestra
            porque la conexión con Google Sheets y el modelo de datos deben terminar de configurarse y superar las pruebas de permisos.
            No se ha importado ni modificado ninguna candidatura.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Siguiente paso</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Se habilitará aquí la lista de candidaturas, sus fases, observaciones e historial cuando la API segura y la sincronización
            idempotente estén listas. Hasta entonces, este panel no consulta ni expone datos de selección.
          </p>
        </section>
      </div>
    </main>
  )
}
