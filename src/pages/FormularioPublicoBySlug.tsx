import React, { useEffect, useState } from "react"
import { useParams, Navigate } from "react-router-dom"
import { getBySlug } from "../servicios/UseSurveys"

export default function FormularioPublicoBySlug() {
  const { slug } = useParams<{ slug: string }>()
  const [encuestaId, setEncuestaId] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        if (!slug) {
          setNotFound(true)
          setLoading(false)
          return
        }
        const doc = await getBySlug(slug)
        if (doc?.id) {
          setEncuestaId(doc.id)
        } else {
          setNotFound(true)
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="text-slate-600">Cargando…</div>
      </div>
    )
  }

  if (notFound || !encuestaId) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="max-w-xl w-full bg-white border rounded-2xl p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-rose-600 mb-2">Formulario no encontrado</h1>
          <p className="text-slate-700">Verifica el enlace de registro.</p>
        </div>
      </div>
    )
  }

  // Redirige al formulario público por ID (reutiliza la pantalla existente)
  return <Navigate to={`/formulario-publico/${encuestaId}`} replace />
}
