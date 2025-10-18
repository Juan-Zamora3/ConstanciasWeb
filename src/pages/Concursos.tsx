// src/pages/Concursos.tsx
import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { Link, useNavigate } from "react-router-dom"

// Firebase
import { db } from "../servicios/firebaseConfig"
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  where,
  getDocs,
  doc,
} from "firebase/firestore"
import type { DocumentData } from "firebase/firestore" 

/* ---------------- Tipos ---------------- */
export type EstadoConcurso = "Activo" | "Próximo" | "Finalizado"
export type Concurso = {
  id: string
  nombre: string
  categoria: string
  sede: string
  fechaInicio: string
  fechaFin: string
  estatus: EstadoConcurso
  participantesActual: number
  participantesMax: number
  portadaUrl?: string
}

type Equipo = {
  id: string
  nombreEquipo: string
  nombreLider?: string
  integrantes: string[]
  contactoEquipo?: string
  categoria?: string
  submittedAt?: string
  maestroAsesor?: string // custom.p1
  institucion?: string   // custom.p2
  telefono?: string      // custom.p3
  escolaridad?: string   // custom.p4
}

/* ---------------- Utilidades ---------------- */
const toISO = (v: unknown): string => {
  try {
    if (!v) return ""
    if (v instanceof Timestamp) return v.toDate().toISOString().slice(0, 10)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    const s = String(v)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {}
  return ""
}

const safeEstado = (v: unknown): EstadoConcurso => {
  const s = String(v || "").toLowerCase()
  if (s === "activo") return "Activo"
  if (s === "próximo" || s === "proximo") return "Próximo"
  if (s === "finalizado" || s === "cerrado") return "Finalizado"
  return "Activo"
}

/* ---------------- UI helpers ---------------- */
function Chip({
  children,
  tone = "azul",
}: { children: React.ReactNode; tone?: "azul" | "gris" | "verde" }) {
  const map: Record<"azul" | "gris" | "verde", string> = {
    azul: "bg-gray-100 text-tecnm-azul",
    gris: "bg-gray-100 text-gray-700",
    verde: "bg-green-100 text-green-700",
  }
  return <span className={`px-2 py-0.5 text-xs rounded-full ${map[tone]}`}>{children}</span>
}

function BarraProgreso({ actual, total }: { actual: number; total: number }) {
  const pct = Math.min(100, Math.round((actual / Math.max(1, total)) * 100))
  return (
    <div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-600">
        {actual}/{total} participantes
      </p>
    </div>
  )
}

function DotsMenu({
  onEdit,
  onDuplicate,
  onClose,
  onDelete,
}: {
  onEdit: () => void
  onDuplicate: () => void
  onClose: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 grid place-items-center rounded-lg border border-gray-200 hover:bg-gray-50"
        aria-label="Abrir menú de acciones"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M12 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-44 rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden z-10"
          >
            <button onClick={() => { setOpen(false); onEdit() }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Editar</button>
            <button onClick={() => { setOpen(false); onDuplicate() }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Duplicar</button>
            <button onClick={() => { setOpen(false); onClose() }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Cerrar/Finalizar</button>
            <button onClick={() => { setOpen(false); onDelete() }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">Eliminar</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------- Modal de Equipos ---------------- */
function ModalEquipos({
  open,
  onClose,
  concurso,
  equipos,
  cargando,
  error,
}: {
  open: boolean
  onClose: () => void
  concurso?: Concurso | null
  equipos: Equipo[]
  cargando: boolean
  error: string | null
}) {
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <motion.div
        key="modal"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        <div
          className="w-full max-w-4xl rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">
                Equipos – {concurso?.nombre ?? "Concurso"}
              </h2>
              <p className="text-xs text-gray-500">
                {concurso?.categoria ?? "Categoría"} · {concurso?.sede ?? "Sede"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Cerrar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="p-5 max-h-[70vh] overflow-auto">
            {cargando && (
              <Card className="p-6 text-sm text-gray-600">Cargando equipos…</Card>
            )}
            {error && !cargando && (
              <Card className="p-6 text-sm text-red-600">{error}</Card>
            )}

            {!cargando && !error && equipos.length === 0 && (
              <Card className="p-6 text-sm text-gray-600">
                No se encontraron respuestas para este concurso.
              </Card>
            )}

            {!cargando && !error && equipos.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {equipos.map((eq) => (
                  <Card key={eq.id} className="p-4 border-gray-100">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-tecnm-azul/10 text-tecnm-azul font-bold">
                        {eq.nombreEquipo?.slice(0,2)?.toUpperCase() || "EQ"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">
                            {eq.nombreEquipo || "Equipo"}
                          </h3>
                          {eq.categoria && <Chip tone="gris">{eq.categoria}</Chip>}
                        </div>
                        <p className="text-xs text-gray-600">
                          Líder: {eq.nombreLider || "—"}
                          {eq.submittedAt && <> · Enviado: {new Date(eq.submittedAt).toLocaleString()}</>}
                        </p>

                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">Integrantes:</p>
                          <ul className="text-sm list-disc ml-5 space-y-0.5">
                            {eq.integrantes?.length
                              ? eq.integrantes.map((n, i) => <li key={i}>{n}</li>)
                              : <li>—</li>}
                          </ul>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                          <div className="rounded-lg border bg-gray-50 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Contacto</p>
                            <p className="truncate">{eq.contactoEquipo || "—"}</p>
                          </div>
                          <div className="rounded-lg border bg-gray-50 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Maestro asesor</p>
                            <p className="truncate">{eq.maestroAsesor || "—"}</p>
                          </div>
                          <div className="rounded-lg border bg-gray-50 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Institución</p>
                            <p className="truncate">{eq.institucion || "—"}</p>
                          </div>
                          <div className="rounded-lg border bg-gray-50 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Escolaridad</p>
                            <p className="truncate">{eq.escolaridad || "—"}</p>
                          </div>
                          <div className="rounded-lg border bg-gray-50 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Teléfono</p>
                            <p className="truncate">{eq.telefono || "—"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ---------------- Tarjeta (click abre modal) ---------------- */
function TarjetaConcurso({
  c,
  onOpenEquipos,
}: {
  c: Concurso
  onOpenEquipos: (c: Concurso) => void
}) {
  const navigate = useNavigate()
  const tone: "azul" | "gris" | "verde" =
    c.estatus === "Activo" ? "azul" : c.estatus === "Próximo" ? "gris" : "verde"

  const irEditar = () => navigate(`/concursos/${c.id}/editar`)

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card
        className="p-4 border-gray-100 hover:border-gray-200 hover:shadow-md transition cursor-pointer"
        onClick={() => onOpenEquipos(c)}
      >
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-bold shrink-0">
            {c.categoria?.slice(0, 2)?.toUpperCase() || "CO"}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{c.nombre || "Concurso"}</h3>
                  <Chip tone={tone}>{c.estatus}</Chip>
                </div>
                <p className="text-sm text-gray-600 truncate">
                  {c.categoria || "Categoría"} · {c.sede || "Sede"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString() : "—"} — {c.fechaFin ? new Date(c.fechaFin).toLocaleDateString() : "—"}
                </p>
              </div>

              {/* Acciones (no detienen el click del card) */}
              <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="sm" onClick={irEditar}>Editar</Button>
                <DotsMenu
                  onEdit={irEditar}
                  onDuplicate={() => alert(`Duplicar ${c.nombre} (pendiente)`)}
                  onClose={() => alert(`Finalizar ${c.nombre} (pendiente)`)}
                  onDelete={() => confirm(`¿Eliminar "${c.nombre}"?`) && alert("Eliminar (pendiente)")}
                />
              </div>
            </div>

            <div className="mt-3">
              <BarraProgreso actual={c.participantesActual} total={c.participantesMax} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" onClick={() => onOpenEquipos(c)}>Ver equipos</Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/plantillas?concursoId=${c.id}`)}>Plantillas</Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/constancias?concursoId=${c.id}`)}>Constancias</Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

/* ------------------------------ Página ------------------------------ */
export default function Concursos() {
  const [busqueda, setBusqueda] = useState<string>("")
  const [tab, setTab] = useState<EstadoConcurso | "Todos">("Todos")
  const [categoria, setCategoria] = useState<string>("Todas")

  const [concursos, setConcursos] = useState<Concurso[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [concursoSel, setConcursoSel] = useState<Concurso | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [equiposLoading, setEquiposLoading] = useState(false)
  const [equiposError, setEquiposError] = useState<string | null>(null)

  // Suscripción a "Cursos"
  useEffect(() => {
    try {
      const ref = collection(db, "Cursos")
      const qy = query(ref, orderBy("fechaInicio", "desc"))
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const rows: Concurso[] = snap.docs.map((d) => {
            const data: DocumentData = d.data() || {}
            const nombre = (data.nombre || data.titulo || data.curso || d.id) as string
            const categoria = (data.categoria || "General") as string
            const sede = (data.sede || data.lugar || "Por definir") as string
            const fechaInicio = toISO(data.fechaInicio || data.inicio || data.constancia?.actualizadoEn)
            const fechaFin = toISO(data.fechaFin || data.fin || data.constancia?.actualizadoEn)
            const participantesActual = Number(data.participantesActual ?? data.inscritos ?? 0)
            const participantesMax = Number(data.participantesMax ?? data.capacidad ?? 30)
            const estatus: EstadoConcurso =
              (data.estatus && safeEstado(data.estatus)) ||
              (() => {
                const hoy = new Date()
                const ini = fechaInicio ? new Date(fechaInicio) : null
                const fin = fechaFin ? new Date(fechaFin) : null
                if (fin && fin < hoy) return "Finalizado"
                if (ini && ini > hoy) return "Próximo"
                return "Activo"
              })()
            const portadaUrl = (data.portadaUrl || data.plantilla?.url || "") as string

            return {
              id: d.id,
              nombre, categoria, sede, fechaInicio, fechaFin,
              estatus, participantesActual, participantesMax, portadaUrl,
            }
          })
          setConcursos(rows); setCargando(false); setError(null)
        },
        (err) => { console.error(err); setError("Error al cargar concursos."); setCargando(false) }
      )
      return () => unsub()
    } catch (e) {
      console.error(e); setError("Error al inicializar la lectura de concursos."); setCargando(false)
    }
  }, [])

  const TABS: Array<EstadoConcurso | "Todos"> = ["Todos", "Activo", "Próximo", "Finalizado"]

  const categorias: string[] = useMemo(() => {
    const set = new Set<string>(concursos.map((c) => c.categoria || "General"))
    return ["Todas", ...Array.from(set)]
  }, [concursos])

  const resultados: Concurso[] = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return concursos.filter((c) => {
      const coincideTexto =
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        c.sede.toLowerCase().includes(q) ||
        c.categoria.toLowerCase().includes(q)

      const coincideEstado = tab === "Todos" ? true : c.estatus === tab
      const coincideCategoria = categoria === "Todas" ? true : c.categoria === categoria

      return coincideTexto && coincideEstado && coincideCategoria
    })
  }, [busqueda, tab, categoria, concursos])

  /* ----------- Lógica: abrir modal y cargar equipos ----------- */
  const abrirEquipos = async (c: Concurso) => {
    setConcursoSel(c)
    setModalOpen(true)
    setEquipos([])
    setEquiposError(null)
    setEquiposLoading(true)

    try {
      // 1) Buscar en "encuestas" las que correspondan al curso (concurso)
      const encuestasRef = collection(db, "encuestas")
      const qEnc = query(encuestasRef, where("cursoId", "==", c.id))
      const encuestasSnap = await getDocs(qEnc)

      const equiposAcumulados: Equipo[] = []

      // 2) Para cada encuesta, leer subcolección "respuestas"
      for (const encDoc of encuestasSnap.docs) {
        const respRef = collection(doc(db, "encuestas", encDoc.id), "respuestas")
        const respSnap = await getDocs(respRef)

        respSnap.forEach((r) => {
          const data = (r.data() || {}) as DocumentData
          const preset = (data.preset || {}) as any
          const custom = (data.custom || {}) as any

          const nombreEquipo = preset.nombreEquipo || data.nombreEquipo || "Equipo"
          const nombreLider = preset.nombreLider || data.nombreLider
          const integrantes = Array.isArray(preset.integrantes)
            ? preset.integrantes
            : Array.isArray(data.integrantes)
              ? data.integrantes
              : []

          const contactoEquipo = preset.contactoEquipo || data.contactoEquipo
          const categoria = preset.categoria || data.categoria
          const submittedAt =
            data.submittedAt instanceof Timestamp
              ? data.submittedAt.toDate().toISOString()
              : (data.submittedAt ? new Date(String(data.submittedAt)).toISOString() : undefined)

          const eq: Equipo = {
            id: r.id,
            nombreEquipo,
            nombreLider,
            integrantes,
            contactoEquipo,
            categoria,
            submittedAt,
            maestroAsesor: custom.p1,
            institucion: custom.p2,
            telefono: custom.p3,
            escolaridad: custom.p4,
          }
          equiposAcumulados.push(eq)
        })
      }

      // Orden opcional por fecha descendente
      equiposAcumulados.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))

      setEquipos(equiposAcumulados)
    } catch (e) {
      console.error(e)
      setEquiposError("No fue posible cargar los equipos de este concurso.")
    } finally {
      setEquiposLoading(false)
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concursos</h1>
          <p className="text-sm text-gray-600">Gestiona equipos, plantillas y constancias por concurso.</p>
        </div>
        <Link to="/" className="text-sm text-tecnm-azul hover:underline">Volver al inicio</Link>
      </div>

      <Card className="p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 overflow-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  tab === t
                    ? "bg-tecnm-azul text-white border-tecnm-azul"
                    : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M21 21l-4.35-4.35m1.35-4.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, sede o categoría…"
                className="w-56 md:w-72 outline-none text-sm"
              />
            </div>

            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm"
            >
              {categorias.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <Button variant="outline" onClick={() => { setBusqueda(""); setCategoria("Todas"); setTab("Todos"); }}>
              Restablecer filtros
            </Button>

            <Button onClick={() => alert("Nuevo concurso (pendiente)")} />
          </div>
        </div>
      </Card>

      {cargando && <Card className="p-8 text-center text-sm text-gray-600">Cargando concursos…</Card>}
      {error && !cargando && <Card className="p-8 text-center text-sm text-red-600">{error}</Card>}

      {!cargando && !error && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Resultados: <strong>{resultados.length}</strong></span>
        </div>
      )}

      {!cargando && !error && (
        resultados.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-600">No se encontraron concursos con esos filtros.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resultados.map((c) => (
              <TarjetaConcurso key={c.id} c={c} onOpenEquipos={abrirEquipos} />
            ))}
          </div>
        )
      )}

      {/* Modal */}
      <ModalEquipos
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        concurso={concursoSel}
        equipos={equipos}
        cargando={equiposLoading}
        error={equiposError}
      />
    </section>
  )
}
