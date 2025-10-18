// src/pages/FormularioPublico.tsx
import React, { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { db } from "../servicios/firebaseConfig"
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { motion } from "framer-motion"

/* ========= Tipos ========= */
type CampoPresetFlags = {
  nombreEquipo?: boolean
  nombreLider?: boolean
  contactoEquipo?: boolean
  categoria?: boolean
}

type TipoPregunta = "texto" | "select" | "radio" | "checkbox"

type Pregunta = {
  id: string // e.g. "p1", "p2"...
  titulo: string
  tipo: TipoPregunta
  opciones?: string[]
  requerido?: boolean
}

type EncuestaDoc = {
  cursoId?: string
  tituloCurso?: string
  descripcionCurso?: string
  categorias?: string[] // categorías para el select
  cantidadParticipantes?: number
  camposPreestablecidos?: CampoPresetFlags
  preguntas?: Pregunta[]
  // Apariencia (opcional; puedes expandir si ya lo guardas)
  apariencia?: {
    colorTitulo?: string
    colorTexto?: string
    colorFondo?: string
    overlay?: number
    bgImageUrl?: string
  }
}

/* ========= UI helpers simples ========= */
function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-800">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function ErrorText({ text }: { text?: string }) {
  if (!text) return null
  return <p className="text-xs text-red-600 mt-1">{text}</p>
}

/* ========= Página ========= */
export default function FormularioPublico() {
  const { encuestaId } = useParams<{ encuestaId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [encuesta, setEncuesta] = useState<EncuestaDoc | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  // Estado del formulario (preset)
  const [nombreEquipo, setNombreEquipo] = useState("")
  const [nombreLider, setNombreLider] = useState("")
  const [contactoEquipo, setContactoEquipo] = useState("") // email
  const [categoria, setCategoria] = useState("")
  const [integrantes, setIntegrantes] = useState<string[]>([])

  // Preguntas personalizadas
  const [custom, setCustom] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Leer encuesta
  useEffect(() => {
    const run = async () => {
      try {
        if (!encuestaId) {
          setError("Encuesta no especificada.")
          setLoading(false)
          return
        }
        const ref = doc(db, "encuestas", encuestaId)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setError("No se encontró la encuesta.")
          setLoading(false)
          return
        }
        const data = (snap.data() || {}) as any

        const cfg: EncuestaDoc = {
          cursoId: data.cursoId ?? "",
          tituloCurso: data.tituloCurso ?? data.nombreCurso ?? "",
          descripcionCurso: data.descripcionCurso ?? "",
          categorias: Array.isArray(data.categorias) ? data.categorias : [],
          cantidadParticipantes:
            typeof data.cantidadParticipantes === "number"
              ? data.cantidadParticipantes
              : 4,
          camposPreestablecidos: data.camposPreestablecidos || data.camposPreestablecidos || {},
          preguntas: Array.isArray(data.preguntas) ? data.preguntas : [],
          apariencia: data.apariencia || {},
        }

        // Inicializa integrantes y custom
        setIntegrantes(Array.from({ length: cfg.cantidadParticipantes ?? 4 }, () => ""))
        const initCustom: Record<string, string | string[]> = {}
        ;(cfg.preguntas || []).forEach((p) => {
          if (p.tipo === "checkbox") initCustom[p.id] = []
          else initCustom[p.id] = ""
        })
        setCustom(initCustom)

        setEncuesta(cfg)
        setLoading(false)
      } catch (e) {
        console.error(e)
        setError("Ocurrió un error al cargar el formulario.")
        setLoading(false)
      }
    }
    run()
  }, [encuestaId])

  const presets = encuesta?.camposPreestablecidos || {}
  const categorias = encuesta?.categorias || []
  const preguntas = encuesta?.preguntas || []
  const cant = encuesta?.cantidadParticipantes ?? 4

  // Validación
  const validar = (): boolean => {
    const e: Record<string, string> = {}

    if (presets.nombreEquipo && !nombreEquipo.trim())
      e.nombreEquipo = "Este campo es requerido."
    if (presets.nombreLider && !nombreLider.trim())
      e.nombreLider = "Este campo es requerido."
    if (presets.contactoEquipo) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactoEquipo.trim())
      if (!ok) e.contactoEquipo = "Escribe un correo válido."
    }
    if (presets.categoria && !categoria.trim())
      e.categoria = "Selecciona una categoría."

    preguntas.forEach((p) => {
      if (!p.requerido) return
      const val = custom[p.id]
      if (p.tipo === "checkbox") {
        if (!Array.isArray(val) || val.length === 0) e[p.id] = "Selecciona al menos una opción."
      } else {
        if (!String(val ?? "").trim()) e[p.id] = "Este campo es requerido."
      }
    })

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Enviar
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!encuestaId) return
    if (!validar()) return

    try {
      setEnviando(true)
      const refRespuestas = collection(db, "encuestas", encuestaId, "respuestas")
      await addDoc(refRespuestas, {
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        preset: {
          nombreEquipo: presets.nombreEquipo ? nombreEquipo.trim() : undefined,
          nombreLider: presets.nombreLider ? nombreLider.trim() : undefined,
          contactoEquipo: presets.contactoEquipo ? contactoEquipo.trim() : undefined,
          categoria: presets.categoria ? categoria : undefined,
          integrantes: integrantes.filter((n) => !!n.trim()),
        },
        custom, // tal cual { p1: ..., p2: ..., ... }
      })
      setEnviado(true)
    } catch (err) {
      console.error(err)
      setError("No fue posible enviar el formulario. Intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  const tituloColor = encuesta?.apariencia?.colorTitulo || "#0f172a"
  const textoColor = encuesta?.apariencia?.colorTexto || "#0f172a"

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="text-slate-600">Cargando formulario…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="max-w-xl w-full bg-white border rounded-2xl p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-slate-700">{error}</p>
        </div>
      </div>
    )
  }

  if (enviado) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl w-full bg-white border rounded-2xl p-6 shadow-sm text-center"
        >
          <h1 className="text-2xl font-bold mb-2" style={{ color: tituloColor }}>
            ¡Registro enviado!
          </h1>
          <p className="text-slate-700">
            Gracias por registrar a tu equipo. Te llegará un correo de confirmación si el
            organizador lo habilita.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-4xl">
        {/* Encabezado */}
        <div className="mb-6">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: tituloColor }}
          >
            Registro de Grupos{encuesta?.tituloCurso ? ` – ${encuesta.tituloCurso}` : ""}
          </h1>
          {encuesta?.descripcionCurso && (
            <p className="mt-1 text-slate-700">{encuesta.descripcionCurso}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            Participantes por equipo: <strong>{cant}</strong>
          </p>
        </div>

        {/* Formulario */}
        <form
          className="bg-white border rounded-2xl shadow-sm p-5 space-y-5"
          onSubmit={onSubmit}
        >
          {/* Preset */}
          {presets.nombreEquipo && (
            <Field
              label="Nombre del Equipo. (El nombre no debe contener palabras o denominaciones que se consideren inapropiadas)."
              required
            >
              <input
                value={nombreEquipo}
                onChange={(e) => setNombreEquipo(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="Nombre del equipo"
              />
              <ErrorText text={errors.nombreEquipo} />
            </Field>
          )}

          {presets.nombreLider && (
            <Field
              label="Nombre del líder del equipo. (Importante: este dato se utilizará para generar su constancia de participación)"
              required
            >
              <input
                value={nombreLider}
                onChange={(e) => setNombreLider(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="Nombre del líder"
              />
              <ErrorText text={errors.nombreLider} />
            </Field>
          )}

          {presets.contactoEquipo && (
            <Field label="Correo del Equipo (para recibir la constancia)" required>
              <input
                value={contactoEquipo}
                onChange={(e) => setContactoEquipo(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="nombre@dominio.com"
                type="email"
              />
              <ErrorText text={errors.contactoEquipo} />
            </Field>
          )}

          {presets.categoria && (
            <Field label="Categoría" required>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="">Seleccione una categoría</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ErrorText text={errors.categoria} />
            </Field>
          )}

          {/* Integrantes */}
          {Array.from({ length: cant }).map((_, i) => (
            <Field key={i} label={`Integrante ${i + 1}`}>
              <input
                value={integrantes[i] ?? ""}
                onChange={(e) => {
                  const next = [...integrantes]
                  next[i] = e.target.value
                  setIntegrantes(next)
                }}
                className="w-full rounded-xl border px-3 py-2"
                placeholder={`Nombre del integrante ${i + 1}`}
              />
            </Field>
          ))}

          {/* Preguntas personalizadas */}
          {preguntas.length > 0 && (
            <div className="pt-2">
              <h2
                className="text-xl font-bold mb-3"
                style={{ color: tituloColor }}
              >
                Preguntas Personalizadas
              </h2>

              <div className="space-y-4">
                {preguntas.map((p) => {
                  const val = custom[p.id]
                  const setVal = (v: string | string[]) =>
                    setCustom((prev) => ({ ...prev, [p.id]: v }))

                  if (p.tipo === "texto") {
                    return (
                      <Field key={p.id} label={p.titulo} required={p.requerido}>
                        <input
                          value={String(val ?? "")}
                          onChange={(e) => setVal(e.target.value)}
                          className="w-full rounded-xl border px-3 py-2"
                          placeholder={p.titulo}
                        />
                        <ErrorText text={errors[p.id]} />
                      </Field>
                    )
                  }

                  if (p.tipo === "select") {
                    return (
                      <Field key={p.id} label={p.titulo} required={p.requerido}>
                        <select
                          value={String(val ?? "")}
                          onChange={(e) => setVal(e.target.value)}
                          className="w-full rounded-xl border px-3 py-2"
                        >
                          <option value="">Selecciona una opción</option>
                          {(p.opciones || []).map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                        <ErrorText text={errors[p.id]} />
                      </Field>
                    )
                  }

                  if (p.tipo === "radio") {
                    return (
                      <Field key={p.id} label={p.titulo} required={p.requerido}>
                        <div className="space-y-2">
                          {(p.opciones || []).map((op) => (
                            <label key={op} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={p.id}
                                checked={String(val ?? "") === op}
                                onChange={() => setVal(op)}
                              />
                              <span>{op}</span>
                            </label>
                          ))}
                        </div>
                        <ErrorText text={errors[p.id]} />
                      </Field>
                    )
                  }

                  // checkbox
                  const arr = Array.isArray(val) ? (val as string[]) : []
                  const toggle = (op: string) => {
                    const has = arr.includes(op)
                    const next = has ? arr.filter((x) => x !== op) : [...arr, op]
                    setVal(next)
                  }
                  return (
                    <Field key={p.id} label={p.titulo} required={p.requerido}>
                      <div className="space-y-2">
                        {(p.opciones || []).map((op) => (
                          <label key={op} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={arr.includes(op)}
                              onChange={() => toggle(op)}
                            />
                            <span>{op}</span>
                          </label>
                        ))}
                      </div>
                      <ErrorText text={errors[p.id]} />
                    </Field>
                  )
                })}
              </div>
            </div>
          )}

          {/* Botón enviar */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={enviando}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-tecnm-azul text-white hover:brightness-95 disabled:opacity-60"
            >
              {enviando ? "Enviando…" : "Enviar registro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
