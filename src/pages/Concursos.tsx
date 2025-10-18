// src/pages/Concursos.tsx
import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { Link, useNavigate } from "react-router-dom"

// Firebase
import { db, storage } from "../servicios/firebaseConfig"
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  where,
  getDocs,
  doc as fsDoc,
  updateDoc,
} from "firebase/firestore"
import type { DocumentData } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"

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
  instructor?: string
  descripcion?: string
  tipoCurso?: "personal" | "grupos"
}

type Equipo = {
  id: string
  nombreEquipo: string
  nombreLider?: string
  integrantes: string[]
  contactoEquipo?: string
  categoria?: string
  submittedAt?: string
  maestroAsesor?: string
  institucion?: string
  telefono?: string
  escolaridad?: string
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
function Chip({ children, tone = "azul" }: { children: React.ReactNode; tone?: "azul" | "gris" | "verde" }) {
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
        <div className="h-2 rounded-full bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-600">{actual}/{total} participantes</p>
    </div>
  )
}

/* ---------------- Modal EDITAR ---------------- */
function EditCursoModal({
  open,
  onClose,
  curso,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  curso: Concurso | null
  onSaved: (patch: Partial<Concurso>) => void
}) {
  const navigate = useNavigate()

  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState("")
  const [instructor, setInstructor] = useState("")
  const [sede, setSede] = useState("")
  const [categoria, setCategoria] = useState("")
  const [fechaInicio, setFechaInicio] = useState("")
  const [fechaFin, setFechaFin] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [tipoCurso, setTipoCurso] = useState<"personal" | "grupos">("grupos")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | undefined>(undefined)
  const [jumping, setJumping] = useState(false) // para deshabilitar botones de “ir al builder/público”

  useEffect(() => {
    if (!curso) return
    setNombre(curso.nombre || "")
    setInstructor(curso.instructor || "")
    setSede(curso.sede || "")
    setCategoria(curso.categoria || "")
    setFechaInicio(curso.fechaInicio || "")
    setFechaFin(curso.fechaFin || "")
    setDescripcion(curso.descripcion || "")
    setTipoCurso(curso.tipoCurso || "grupos")
    setPreview(curso.portadaUrl)
    setFile(null)
  }, [curso])

  if (!open || !curso) return null

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }
  const quitarPortada = () => { setFile(null); setPreview(undefined) }

  const guardar = async () => {
    try {
      setSaving(true)
      const patch: Partial<Concurso> = {
        nombre: nombre.trim(),
        instructor: instructor.trim(),
        sede: sede.trim(),
        categoria: categoria.trim(),
        fechaInicio,
        fechaFin,
        descripcion: descripcion.trim(),
        tipoCurso,
      }

      let portadaUrl = preview
      if (file) {
        const path = `cursos/${curso.id}/portada-${Date.now()}-${file.name}`
        const r = ref(storage, path)
        await uploadBytes(r, file)
        portadaUrl = await getDownloadURL(r)
      } else if (!preview) {
        portadaUrl = ""
      }
      patch.portadaUrl = portadaUrl || ""

      await updateDoc(fsDoc(db, "Cursos", curso.id), patch as any)
      onSaved(patch)
      onClose()
    } catch (err) {
      console.error(err)
      alert("No se pudo guardar. Revisa la consola.")
    } finally {
      setSaving(false)
    }
  }

  /** Busca/crea la encuesta ligada a este curso y retorna su ID */
  const ensureEncuesta = async (cursoId: string): Promise<string> => {
    // ¿ya existe?
    const qy = query(collection(db, "encuestas"), where("cursoId", "==", cursoId))
    const snap = await getDocs(qy)
    if (!snap.empty) return snap.docs[0].id

    // crear con estructura base (coincide con la que mostraste)
    const baseDoc = {
      cursoId,
      creadoEn: Timestamp.now(),
      creadoPor: null as string | null,
      camposPreestablecidos: {
        nombreEquipo: true,
        nombreLider: true,
        contactoEquipo: true,
        categoria: true,
        cantidadParticipantes: true,
      },
      cantidadParticipantes: 1,
      categorias: [] as string[],
      apariencia: {
        fondoColor: "#f8fafc",
        tituloColor: "#0f172a",
        textoColor: "#0f172a",
        overlay: 0.35,
        fondoImagenUrl: "",
        titulo: "Título de ejemplo",
        subtitulo: "Texto de ejemplo del formulario",
      },
      preguntasPersonalizadas: [] as any[],
      habilitado: true,
    }
    const refDoc = await addDoc(collection(db, "encuestas"), baseDoc)
    return refDoc.id
  }

  const gotoBuilder = async () => {
    try {
      setJumping(true)
      const encuestaId = await ensureEncuesta(curso.id)
      onClose()
      navigate(`/formulario-builder/${encuestaId}`)
    } finally {
      setJumping(false)
    }
  }

  const gotoPublic = async () => {
    try {
      setJumping(true)
      const encuestaId = await ensureEncuesta(curso.id)
      onClose()
      navigate(`/formulario-publico/${encuestaId}`)
    } finally {
      setJumping(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/30" onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        <div
          className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="text-lg font-semibold">Editar curso</h2>
            <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 hover:bg-gray-50">✕</button>
          </div>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-auto">
            {/* Portada */}
            <div>
              <p className="font-medium mb-2">Imagen del Curso</p>
              {preview ? (
                <div className="relative inline-block">
                  <img src={preview} alt="portada" className="h-32 w-32 object-cover rounded-xl" />
                  <button
                    type="button"
                    onClick={quitarPortada}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-600 text-white text-xs"
                    title="Quitar portada"
                  >x</button>
                </div>
              ) : (
                <label className="text-tecnm-azul cursor-pointer underline">
                  Seleccionar imagen
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </label>
              )}
              {preview && (
                <div className="mt-2">
                  <label className="text-tecnm-azul cursor-pointer underline">
                    Cambiar imagen
                    <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                  </label>
                </div>
              )}
            </div>

            {/* Básicos */}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">Título del Curso *</label>
                <input className="w-full rounded-xl border px-3 py-2" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Instructor *</label>
                <input className="w-full rounded-xl border px-3 py-2" value={instructor} onChange={(e)=>setInstructor(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Ubicación</label>
                <input className="w-full rounded-xl border px-3 py-2" value={sede} onChange={(e)=>setSede(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Categoría *</label>
                <select className="w-full rounded-xl border px-3 py-2" value={categoria} onChange={(e)=>setCategoria(e.target.value)}>
                  <option value="">Selecciona…</option>
                  <option value="Ventas">Ventas</option>
                  <option value="Tecnología">Tecnología</option>
                  <option value="Educación">Educación</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha de Inicio *</label>
                <input type="date" className="w-full rounded-xl border px-3 py-2" value={fechaInicio} onChange={(e)=>setFechaInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha de Fin *</label>
                <input type="date" className="w-full rounded-xl border px-3 py-2" value={fechaFin} onChange={(e)=>setFechaFin(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600">Descripción</label>
              <textarea className="w-full rounded-xl border px-3 py-2" rows={3} value={descripcion} onChange={(e)=>setDescripcion(e.target.value)} />
            </div>

            {/* Tipo */}
            <div>
              <p className="text-sm text-gray-600 mb-1">Tipo de Curso</p>
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={()=>setTipoCurso("personal")}
                  className={`text-left p-3 rounded-xl border ${tipoCurso==="personal" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white"}`}
                >
                  <div className="font-medium">Por Personal</div>
                  <div className="text-sm text-gray-600">Gestión individual de participantes</div>
                </button>
                <button
                  type="button"
                  onClick={()=>setTipoCurso("grupos")}
                  className={`text-left p-3 rounded-xl border ${tipoCurso==="grupos" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white"}`}
                >
                  <div className="font-medium">Por Grupos</div>
                  <div className="text-sm text-gray-600">Gestión por grupos o lotes</div>
                </button>
              </div>
            </div>

            {/* Enlaces rápidos al builder / público si es "grupos" */}
            {tipoCurso === "grupos" && (
              <div className="rounded-xl border bg-gray-50 p-3">
                <p className="text-sm font-medium mb-2">Formulario de grupos</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="solid" onClick={gotoBuilder} disabled={jumping}>
                    {jumping ? "Abriendo…" : "Configurar formulario"}
                  </Button>
                  <Button variant="outline" onClick={gotoPublic} disabled={jumping}>
                    {jumping ? "Abriendo…" : "Ver/editar registro público"}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Se creará automáticamente la encuesta del curso si aún no existe.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={saving || jumping}>Cancelar</Button>
            <Button variant="solid" onClick={guardar} disabled={saving || jumping}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ---------------- Modal EQUIPOS ---------------- */
function ModalEquipos({
  open, onClose, concurso, equipos, cargando, error,
}: { open: boolean; onClose: () => void; concurso?: Concurso | null; equipos: Equipo[]; cargando: boolean; error: string | null }) {
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.98 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 grid place-items-center p-4">
        <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">Equipos – {concurso?.nombre ?? "Concurso"}</h2>
              <p className="text-xs text-gray-500">{concurso?.categoria ?? "Categoría"} · {concurso?.sede ?? "Sede"}</p>
            </div>
            <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 hover:bg-gray-50" aria-label="Cerrar">✕</button>
          </div>

          <div className="p-5 max-h-[70vh] overflow-auto">
            {cargando && <Card className="p-6 text-sm text-gray-600">Cargando equipos…</Card>}
            {error && !cargando && <Card className="p-6 text-sm text-red-600">{error}</Card>}
            {!cargando && !error && equipos.length === 0 && <Card className="p-6 text-sm text-gray-600">No se encontraron respuestas para este concurso.</Card>}

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
                          <h3 className="font-semibold truncate">{eq.nombreEquipo || "Equipo"}</h3>
                          {eq.categoria && <Chip tone="gris">{eq.categoria}</Chip>}
                        </div>
                        <p className="text-xs text-gray-600">
                          Líder: {eq.nombreLider || "—"}
                          {eq.submittedAt && <> · Enviado: {new Date(eq.submittedAt).toLocaleString()}</>}
                        </p>
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">Integrantes:</p>
                          <ul className="text-sm list-disc ml-5 space-y-0.5">
                            {eq.integrantes?.length ? eq.integrantes.map((n, i) => <li key={i}>{n}</li>) : <li>—</li>}
                          </ul>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                          <Info label="Contacto" value={eq.contactoEquipo} />
                          <Info label="Maestro asesor" value={eq.maestroAsesor} />
                          <Info label="Institución" value={eq.institucion} />
                          <Info label="Escolaridad" value={eq.escolaridad} />
                          <Info label="Teléfono" value={eq.telefono} />
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
function Info({label, value}:{label:string; value?:string}) {
  return (
    <div className="rounded-lg border bg-gray-50 p-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="truncate">{value || "—"}</p>
    </div>
  )
}

/* ---------------- Tarjeta ---------------- */
function TarjetaConcurso({
  c,
  onOpenEquipos,
  onEdit,
}: {
  c: Concurso
  onOpenEquipos: (c: Concurso) => void
  onEdit: (c: Concurso) => void
}) {
  const navigate = useNavigate()
  const tone: "azul" | "gris" | "verde" = c.estatus === "Activo" ? "azul" : c.estatus === "Próximo" ? "gris" : "verde"

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="p-0 overflow-hidden rounded-2xl border border-gray-100 hover:shadow-lg hover:border-gray-200 transition cursor-pointer bg-white" onClick={() => onOpenEquipos(c)}>
        {/* Portada */}
        {c.portadaUrl ? (
          <div className="h-40 w-full bg-gray-100">
            <img src={c.portadaUrl} alt="portada" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-2 w-full bg-gray-100" />
        )}

        {/* Contenido */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-bold shrink-0">
              {c.categoria?.slice(0, 2)?.toUpperCase() || "CO"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[15px] leading-tight truncate">{c.nombre || "Concurso"}</h3>
                <Chip tone={tone}>{c.estatus}</Chip>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString() : "—"} — {c.fechaFin ? new Date(c.fechaFin).toLocaleDateString() : "—"}
              </p>
              {c.instructor && <p className="text-sm text-gray-700 mt-1 truncate">{c.instructor}</p>}
              {c.sede && <p className="text-xs text-gray-600 truncate">{c.sede}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="solid"
              className="bg-tecnm-azul text-white hover:bg-tecnm-azul-700"
              onClick={() => onEdit(c)}
            >
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-tecnm-azul text-tecnm-azul hover:bg-tecnm-azul/5"
              onClick={() => navigate(`/plantillas?concursoId=${c.id}`)}
            >
              Plantillas
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-tecnm-azul text-tecnm-azul hover:bg-tecnm-azul/5"
              onClick={() => navigate(`/constancias?concursoId=${c.id}`)}
            >
              Constancias
            </Button>
          </div>

          <div className="pt-1">
            <BarraProgreso actual={c.participantesActual} total={c.participantesMax} />
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

  // Modal equipos
  const [modalOpen, setModalOpen] = useState(false)
  const [concursoSel, setConcursoSel] = useState<Concurso | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [equiposLoading, setEquiposLoading] = useState(false)
  const [equiposError, setEquiposError] = useState<string | null>(null)

  // Modal editar
  const [editOpen, setEditOpen] = useState(false)
  const [editCurso, setEditCurso] = useState<Concurso | null>(null)

  useEffect(() => {
    try {
      const refCursos = collection(db, "Cursos")
      const qy = query(refCursos, orderBy("fechaInicio", "desc"))
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
            const instructor = (data.instructor || "") as string
            const descripcion = (data.descripcion || "") as string
            const tipoCurso = (data.tipoCurso || "grupos") as "personal" | "grupos"

            return {
              id: d.id,
              nombre, categoria, sede, fechaInicio, fechaFin, estatus,
              participantesActual, participantesMax, portadaUrl, instructor, descripcion, tipoCurso,
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

  /* ----------- Abrir modal EQUIPOS ----------- */
  const abrirEquipos = async (c: Concurso) => {
    setConcursoSel(c); setModalOpen(true); setEquipos([]); setEquiposError(null); setEquiposLoading(true)
    try {
      const encuestasRef = collection(db, "encuestas")
      const qEnc = query(encuestasRef, where("cursoId", "==", c.id))
      const encuestasSnap = await getDocs(qEnc)
      const equiposAcumulados: Equipo[] = []
      for (const encDoc of encuestasSnap.docs) {
        const respRef = collection(fsDoc(db, "encuestas", encDoc.id), "respuestas")
        const respSnap = await getDocs(respRef)
        respSnap.forEach((r) => {
          const data = (r.data() || {}) as DocumentData
          const preset = (data.preset || {}) as any
          const custom = (data.custom || {}) as any
          const nombreEquipo = preset.nombreEquipo || (data as any).nombreEquipo || "Equipo"
          const nombreLider = preset.nombreLider || (data as any).nombreLider
          const integrantes = Array.isArray(preset.integrantes)
            ? preset.integrantes
            : Array.isArray((data as any).integrantes)
              ? (data as any).integrantes
              : []
          const contactoEquipo = preset.contactoEquipo || (data as any).contactoEquipo
          const categoria = preset.categoria || (data as any).categoria
          const submittedAt =
            (data as any).submittedAt instanceof Timestamp
              ? (data as any).submittedAt.toDate().toISOString()
              : ((data as any).submittedAt ? new Date(String((data as any).submittedAt)).toISOString() : undefined)

          equiposAcumulados.push({
            id: r.id, nombreEquipo, nombreLider, integrantes, contactoEquipo, categoria, submittedAt,
            maestroAsesor: custom.p1, institucion: custom.p2, telefono: custom.p3, escolaridad: custom.p4,
          })
        })
      }
      equiposAcumulados.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))
      setEquipos(equiposAcumulados)
    } catch (e) { console.error(e); setEquiposError("No fue posible cargar los equipos de este concurso.") }
    finally { setEquiposLoading(false) }
  }

  /* ----------- Abrir modal EDITAR ----------- */
  const abrirEditar = (c: Concurso) => { setEditCurso(c); setEditOpen(true) }
  const onSavedPatch = (patch: Partial<Concurso>) => {
    setConcursos((prev) => prev.map((x) => (x.id === (editCurso?.id || "") ? { ...x, ...patch } : x)))
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

      {/* Barra de acciones */}
      <Card className="p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 overflow-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${tab === t ? "bg-tecnm-azul text-white border-tecnm-azul" : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200"}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M21 21l-4.35-4.35m1.35-4.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
              <input value={busqueda} onChange={(e)=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, sede o categoría…" className="w-56 md:w-72 outline-none text-sm" />
            </div>

            <select value={categoria} onChange={(e)=>setCategoria(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm">
              {categorias.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
            </select>

            <Button variant="outline" onClick={() => { setBusqueda(""); setCategoria("Todas"); setTab("Todos"); }}>
              Restablecer filtros
            </Button>
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {resultados.map((c) => (
              <TarjetaConcurso key={c.id} c={c} onOpenEquipos={abrirEquipos} onEdit={abrirEditar} />
            ))}
          </div>
        )
      )}

      {/* Modales */}
      <ModalEquipos open={modalOpen} onClose={() => setModalOpen(false)} concurso={concursoSel} equipos={equipos} cargando={equiposLoading} error={equiposError} />
      <EditCursoModal open={editOpen} onClose={() => setEditOpen(false)} curso={editCurso} onSaved={onSavedPatch} />
    </section>
  )
}
