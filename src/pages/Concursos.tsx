// src/pages/Concursos.tsx
import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { Link, useNavigate } from "react-router-dom"
import { Pencil, Layers, FileText, UserPlus, HandCoins } from "lucide-react"

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
  deleteDoc,
  serverTimestamp,
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
  pagado?: boolean
  // meta para editar/eliminar/actualizar
  _encuestaId?: string
  _respId?: string
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
const neoSurface = [
  "relative rounded-xl3",
  "bg-gradient-to-br from-white to-gray-50",
  "border border-white/60",
  "shadow-[0_16px_40px_rgba(2,6,23,0.08),0_2px_4px_rgba(2,6,23,0.05)]",
  "before:content-[''] before:absolute before:inset-0 before:rounded-xl3",
  "before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-10px_26px_rgba(2,6,23,0.06)]",
  "before:pointer-events-none",
].join(" ")

const neoInset = [
  "rounded-xl",
  "bg-gradient-to-br from-white to-gray-50",
  "border border-white/60",
  "shadow-inner shadow-black/10",
].join(" ")

/** Bordes reforzados solo para el modal */
const modalSurface = `${neoSurface} border-gray-200 ring-1 ring-gray-200 bg-white`
const modalInset = `${neoInset} border-gray-200 ring-1 ring-gray-200`

const pill = [
  "relative",
  "rounded-full",
  "bg-white",
  "border border-white/60",
  "shadow-[0_8px_24px_rgba(2,6,23,0.06)]",
  "before:content-[''] before:absolute before:inset-px before:rounded-full",
  "before:pointer-events-none",
  "before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
].join(" ")

/* Pills de estado */
function Chip({
  children,
  tone = "azul",
}: {
  children: React.ReactNode
  tone?: "azul" | "gris" | "verde"
}) {
  const map: Record<"azul" | "gris" | "verde", string> = {
    azul: `${pill} px-3 py-1 text-[11px] font-medium bg-white text-tecnm-azul`,
    gris: `${pill} px-3 py-1 text-[11px] font-medium bg-white text-gray-700`,
    verde: `${pill} px-3 py-1 text-[11px] font-medium bg-white text-tecnm-gris10`,
  }
  return <span className={map[tone]}>{children}</span>
}

/* Barra de progreso */
function BarraProgreso({ actual, total }: { actual: number; total: number }) {
  const pct = Math.min(100, Math.round((actual / Math.max(1, total)) * 100))
  return (
    <div className="space-y-1">
      <div className="h-2.5 w-full rounded-full bg-gradient-to-br from-white to-gray-50 border border-white/70 shadow-inner">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-600">
        {actual}/{total} participantes
      </p>
    </div>
  )
}

/* Botón icónico */
function IconBtn({
  title,
  onClick,
  variant = "outline",
  children,
}: {
  title: string
  onClick: () => void
  variant?: "primary" | "outline"
  children: React.ReactNode
}) {
  const base =
    "h-9 w-9 grid place-items-center rounded-full transition active:scale-95 focus:outline-none"
  const styles =
    variant === "primary"
      ? "text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
      : `${pill} bg-white text-tecnm-azul hover:brightness-[1.02]`
  return (
    <button
      title={title}
      aria-label={title}
      className={`${base} ${styles}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
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
  const [jumping, setJumping] = useState(false)

  // generar link
  const [genLoading, setGenLoading] = useState(false)
  const [linkPublico, setLinkPublico] = useState("")

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
    setLinkPublico("")
  }, [curso])

  if (!open || !curso) return null

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  const guardar = async () => {
    try {
      setSaving(true)

      const basePatch: Partial<Concurso> = {
        nombre: nombre.trim(),
        instructor: instructor.trim(),
        sede: sede.trim(),
        categoria: categoria.trim(),
        fechaInicio,
        fechaFin,
        descripcion: descripcion.trim(),
        tipoCurso,
      }

      const esNuevo = curso.id === "__new__"

      if (esNuevo) {
        const docRef = await addDoc(collection(db, "Cursos"), {
          ...basePatch,
          estatus: "Activo",
          participantesActual: 0,
          participantesMax: 30,
          portadaUrl: "",
        } as any)

        if (file) {
          const path = `cursos/${docRef.id}/portada-${Date.now()}-${file.name}`
          const r = ref(storage, path)
          await uploadBytes(r, file)
          const portadaUrl = await getDownloadURL(r)
          await updateDoc(docRef, { portadaUrl })
        }

        onSaved({}) // actualiza lista
        onClose()
        return
      }

      // edición
      let portadaUrl = preview
      if (file) {
        const path = `cursos/${curso.id}/portada-${Date.now()}-${file.name}`
        const r = ref(storage, path)
        await uploadBytes(r, file)
        portadaUrl = await getDownloadURL(r)
      } else if (!preview) {
        portadaUrl = ""
      }

      await updateDoc(fsDoc(db, "Cursos", curso.id), {
        ...basePatch,
        portadaUrl: portadaUrl || "",
      } as any)

      onSaved({ ...basePatch, portadaUrl: portadaUrl || "" })
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
    const qy = query(collection(db, "encuestas"), where("cursoId", "==", cursoId))
    const snap = await getDocs(qy)
    if (!snap.empty) return snap.docs[0].id

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

  const generarLink = async () => {
    try {
      setGenLoading(true)
      const encuestaId = await ensureEncuesta(curso.id)
      const base = window.location.origin
      setLinkPublico(`${base}/formulario-publico/${encuestaId}`)
    } catch (e) {
      console.error(e)
      alert("No fue posible generar el link.")
    } finally {
      setGenLoading(false)
    }
  }

  const copiarLink = async () => {
    if (!linkPublico) return
    try {
      await navigator.clipboard.writeText(linkPublico)
      alert("Link copiado.")
    } catch {}
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        <div
          className={`${modalSurface} w-full max-w-3xl overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Editar curso</h2>
            <button
              onClick={onClose}
              className={`${pill} h-9 px-3 text-sm`}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-auto">
            {/* Portada */}
            <div>
              <p className="font-medium mb-2">Imagen del Curso</p>
              {preview ? (
                <div className="relative inline-block">
                  <img
                    src={preview}
                    alt="portada"
                    className="h-32 w-32 object-cover rounded-xl border border-gray-200 ring-1 ring-gray-200 shadow-soft"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      setPreview(undefined)
                    }}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-rose-600 text-white text-xs shadow"
                    title="Quitar portada"
                  >
                    x
                  </button>
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
              {[
                { label: "Título del Curso *", val: nombre, set: setNombre, type: "text" },
                { label: "Instructor *", val: instructor, set: setInstructor, type: "text" },
                { label: "Ubicación", val: sede, set: setSede, type: "text" },
              ].map((f, i) => (
                <div key={i}>
                  <label className="text-sm text-gray-600">{f.label}</label>
                  <input
                    className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
                    value={f.val}
                    onChange={(e) => f.set(e.target.value)}
                    type={f.type}
                  />
                </div>
              ))}
              <div>
                <label className="text-sm text-gray-600">Categoría *</label>
                <select
                  className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  <option value="Ventas">Ventas</option>
                  <option value="Tecnología">Tecnología</option>
                  <option value="Educación">Educación</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha de Inicio *</label>
                <input
                  type="date"
                  className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha de Fin *</label>
                <input
                  type="date"
                  className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600">Descripción</label>
              <textarea
                className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            {/* Tipo */}
            <div>
              <p className="text-sm text-gray-600 mb-1">Tipo de Curso</p>
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipoCurso("personal")}
                  className={`text-left p-3 ${modalInset} ${tipoCurso === "personal" ? "ring-2 ring-tecnm-azul/30" : ""}`}
                >
                  <div className="font-medium">Por Personal</div>
                  <div className="text-sm text-gray-600">Gestión individual de participantes</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoCurso("grupos")}
                  className={`text-left p-3 ${modalInset} ${tipoCurso === "grupos" ? "ring-2 ring-tecnm-azul/30" : ""}`}
                >
                  <div className="font-medium">Por Grupos</div>
                  <div className="text-sm text-gray-600">Gestión por grupos o lotes</div>
                </button>
              </div>
            </div>

            {tipoCurso === "grupos" && (
              <div className={`${modalInset} p-3`}>
                <p className="text-sm font-medium mb-2">Formulario de grupos</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="solid"
                    className="rounded-full px-4 py-2 text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
                    onClick={gotoBuilder}
                    disabled={jumping}
                  >
                    {jumping ? "Abriendo…" : "Configurar formulario"}
                  </Button>

                  {/* Generar link público */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      className={`${pill} px-4 py-2 text-tecnm-azul`}
                      onClick={generarLink}
                      disabled={genLoading}
                    >
                      {genLoading ? "Generando…" : "Generar link del registro"}
                    </Button>
                    <input
                      readOnly
                      value={linkPublico}
                      placeholder="El link aparecerá aquí…"
                      className="min-w-[240px] flex-1 rounded-xl border px-3 py-2 text-sm"
                    />
                    <Button variant="outline" className={`${pill} px-4 py-2`} onClick={copiarLink} disabled={!linkPublico}>
                      Copiar
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Se creará automáticamente la encuesta del curso si aún no existe.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
            <Button
              variant="outline"
              className={`${pill} px-4 py-2`}
              onClick={onClose}
              disabled={saving || jumping}
            >
              Cancelar
            </Button>
            <Button
              variant="solid"
              className="rounded-full px-5 py-2 text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
              onClick={guardar}
              disabled={saving || jumping}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ---------------- Modal EQUIPOS (buscador, CRUD, pagado, añadir rápido) ---------------- */
function ModalEquipos({
  open,
  onClose,
  concurso,
  equipos: equiposProp,
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
  const [busq, setBusq] = useState("")
  const [lista, setLista] = useState<Equipo[]>([])
  const [addingOpen, setAddingOpen] = useState(false)

  // encuestas del curso para "añadir rápido"
  const [encuestas, setEncuestas] = useState<{ id: string; titulo?: string }[]>([])
  const [encuestaDestino, setEncuestaDestino] = useState<string>("")

  // editar / ver estados
  const [editEq, setEditEq] = useState<Equipo | null>(null)
  const [viewEq, setViewEq] = useState<Equipo | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)

  // campos añadir rápido
  const [aNombreEquipo, setANombreEquipo] = useState("")
  const [aNombreLider, setANombreLider] = useState("")
  const [aEmail, setAEmail] = useState("")
  const [aCategoria, setACategoria] = useState("")
  const [aIntegrantes, setAIntegrantes] = useState("")
  const [aAsesor, setAAsesor] = useState("")
  const [aInstitucion, setAInstitucion] = useState("")
  const [aTelefono, setATelefono] = useState("")
  const [aEscolaridad, setAEscolaridad] = useState("")
  const [aPagado, setAPagado] = useState(false)

  useEffect(() => {
    setLista(equiposProp || [])
  }, [equiposProp])

  // carga encuestas del curso
  useEffect(() => {
    (async () => {
      if (!open || !concurso?.id) return
      try {
        const qEnc = query(collection(db, "encuestas"), where("cursoId", "==", concurso.id))
        const snap = await getDocs(qEnc)
        const rows = snap.docs.map((d) => ({ id: d.id, titulo: (d.data() as any)?.titulo || d.id }))
        setEncuestas(rows)
        setEncuestaDestino(rows[0]?.id || "")
      } catch (e) {
        setEncuestas([])
        setEncuestaDestino("")
      }
    })()
  }, [open, concurso?.id])

  const filtrados = useMemo(() => {
    const t = busq.trim().toLowerCase()
    if (!t) return lista
    return lista.filter((eq) =>
      [eq.nombreEquipo, eq.nombreLider, eq.categoria, (eq.integrantes || []).join(" "), eq.institucion]
        .join(" ")
        .toLowerCase()
        .includes(t)
    )
  }, [busq, lista])

  const togglePagado = async (eq: Equipo, val: boolean) => {
    if (!eq._encuestaId || !eq._respId) return alert("No se puede actualizar este registro.")
    try {
      await updateDoc(fsDoc(db, "encuestas", eq._encuestaId, "respuestas", eq._respId), { pagado: val })
      setLista((prev) => prev.map((x) => (x._respId === eq._respId ? { ...x, pagado: val } : x)))
    } catch (e) {
      console.error(e)
      alert("No se pudo actualizar el estado de pago.")
    }
  }

  const eliminarEquipo = async (eq: Equipo) => {
    if (!eq._encuestaId || !eq._respId) return alert("No se puede eliminar este registro.")
    if (!confirm(`¿Eliminar el equipo "${eq.nombreEquipo}"?`)) return
    try {
      await deleteDoc(fsDoc(db, "encuestas", eq._encuestaId, "respuestas", eq._respId))
      setLista((prev) => prev.filter((x) => x._respId !== eq._respId))
    } catch (e) {
      console.error(e)
      alert("No se pudo eliminar.")
    }
  }

  const guardarEdicion = async () => {
    if (!editEq || !editEq._encuestaId || !editEq._respId) return
    try {
      setSavingEdit(true)
      const patch: any = {
        preset: {
          nombreEquipo: editEq.nombreEquipo || "",
          nombreLider: editEq.nombreLider || "",
          contactoEquipo: editEq.contactoEquipo || "",
          categoria: editEq.categoria || "",
          integrantes: Array.isArray(editEq.integrantes) ? editEq.integrantes : [],
        },
        custom: {
          p1: editEq.maestroAsesor || "",
          p2: editEq.institucion || "",
          p3: editEq.telefono || "",
          p4: editEq.escolaridad || "",
        },
        pagado: !!editEq.pagado,
      }
      await updateDoc(fsDoc(db, "encuestas", editEq._encuestaId, "respuestas", editEq._respId), patch)
      setLista((prev) =>
        prev.map((x) => (x._respId === editEq._respId ? { ...x, ...editEq } : x))
      )
      setEditEq(null)
    } catch (e) {
      console.error(e)
      alert("No se pudo guardar la edición.")
    } finally {
      setSavingEdit(false)
    }
  }

  const añadirRapido = async () => {
    if (!encuestaDestino) return alert("Selecciona una encuesta destino.")
    try {
      setSavingAdd(true)
      const integrantes = aIntegrantes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const payload = {
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        pagado: aPagado,
        preset: {
          nombreEquipo: aNombreEquipo.trim() || "Equipo",
          nombreLider: aNombreLider.trim() || "",
          contactoEquipo: aEmail.trim() || "",
          categoria: aCategoria.trim() || "",
          integrantes,
        },
        custom: {
          p1: aAsesor.trim() || "",
          p2: aInstitucion.trim() || "",
          p3: aTelefono.trim() || "",
          p4: aEscolaridad.trim() || "",
        },
      }
      const refDoc = await addDoc(collection(db, "encuestas", encuestaDestino, "respuestas"), payload)
      const nuevo: Equipo = {
        id: refDoc.id,
        _respId: refDoc.id,
        _encuestaId: encuestaDestino,
        pagado: aPagado,
        nombreEquipo: payload.preset.nombreEquipo,
        nombreLider: payload.preset.nombreLider,
        integrantes,
        contactoEquipo: payload.preset.contactoEquipo,
        categoria: payload.preset.categoria,
        submittedAt: new Date().toISOString(),
        maestroAsesor: payload.custom.p1,
        institucion: payload.custom.p2,
        telefono: payload.custom.p3,
        escolaridad: payload.custom.p4,
      }
      setLista((prev) => [nuevo, ...prev])
      // limpiar
      setANombreEquipo("")
      setANombreLider("")
      setAEmail("")
      setACategoria("")
      setAIntegrantes("")
      setAAsesor("")
      setAInstitucion("")
      setATelefono("")
      setAEscolaridad("")
      setAPagado(false)
      setAddingOpen(false)
    } catch (e) {
      console.error(e)
      alert("No se pudo añadir.")
    } finally {
      setSavingAdd(false)
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        <div
          className={`${modalSurface} w-full max-w-5xl overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">Equipos – {concurso?.nombre ?? "Concurso"}</h2>
              <p className="text-xs text-gray-500 truncate">
                {concurso?.categoria ?? "Categoría"} · {concurso?.sede ?? "Sede"}
              </p>
            </div>
            <button className={`${pill} h-9 px-3 text-sm`} onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div className="p-5 space-y-3 max-h-[78vh] overflow-auto">
            {/* Barra superior: buscador + añadir rápido */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className={`${pill} flex items-center gap-2 bg-white px-3 py-2 shadow-inner w-full md:w-auto ring-1 ring-gray-200`}>
                <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-70">
                  <path d="M21 21l-4.35-4.35m1.35-4.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
                <input
                  value={busq}
                  onChange={(e) => setBusq(e.target.value)}
                  placeholder="Buscar equipo, líder, categoría, institución…"
                  className="w-full md:w-80 outline-none text-sm bg-transparent"
                />
              </div>

              <div className="flex-1" />

              <Button variant="outline" className={`${pill} px-4 py-2`} onClick={() => setAddingOpen((v) => !v)}>
                {addingOpen ? "Cerrar añadir" : "Añadir rápido"}
              </Button>
            </div>

            {/* Añadir rápido */}
            {addingOpen && (
              <Card className={`${modalInset} p-3`}>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Encuesta destino</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      value={encuestaDestino}
                      onChange={(e) => setEncuestaDestino(e.target.value)}
                    >
                      {encuestas.length === 0 ? (
                        <option value="">(No hay encuestas para este curso)</option>
                      ) : (
                        encuestas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.titulo || e.id}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <label className="text-xs text-gray-600 inline-flex items-center gap-2">
                      <input type="checkbox" checked={aPagado} onChange={(e) => setAPagado(e.target.checked)} />
                      Marcar como pagado
                    </label>
                  </div>

                  <div>
                    <label className="text-xs text-gray-600">Nombre del equipo *</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aNombreEquipo} onChange={(e) => setANombreEquipo(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Nombre del líder</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aNombreLider} onChange={(e) => setANombreLider(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Correo del equipo</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aEmail} onChange={(e) => setAEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Categoría</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aCategoria} onChange={(e) => setACategoria(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-600">Integrantes (separados por coma)</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aIntegrantes} onChange={(e) => setAIntegrantes(e.target.value)} placeholder="Persona 1, Persona 2, Persona 3…" />
                  </div>

                  <div>
                    <label className="text-xs text-gray-600">Maestro asesor</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aAsesor} onChange={(e) => setAAsesor(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Institución</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aInstitucion} onChange={(e) => setAInstitucion(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Teléfono</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aTelefono} onChange={(e) => setATelefono(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Escolaridad</label>
                    <input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={aEscolaridad} onChange={(e) => setAEscolaridad(e.target.value)} />
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAddingOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={añadirRapido} disabled={savingAdd || !aNombreEquipo.trim()}>
                    {savingAdd ? "Guardando…" : "Añadir"}
                  </Button>
                </div>
              </Card>
            )}

            {/* Lista */}
            {cargando && <Card className={`${modalInset} p-6 text-sm text-gray-600`}>Cargando equipos…</Card>}
            {error && !cargando && <Card className={`${modalInset} p-6 text-sm text-rose-600`}>{error}</Card>}
            {!cargando && !error && filtrados.length === 0 && (
              <Card className={`${modalInset} p-6 text-sm text-gray-600`}>No se encontraron respuestas para este concurso.</Card>
            )}

            {!cargando && !error && filtrados.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtrados.map((eq) => (
                  <Card key={eq.id} className={`p-4 ${modalSurface} relative`}>
                    {/* Chip/checkbox de Pagado - arriba a la derecha */}
                    <label
                      className="absolute top-2 right-2 z-10 inline-flex items-center gap-2 rounded-full
                                 bg-white/95 backdrop-blur px-2.5 py-1 text-[11px] font-medium
                                 border border-gray-200 ring-1 ring-gray-200 shadow-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!eq.pagado}
                        onChange={(e) => togglePagado(eq, e.target.checked)}
                      />
                      <span>Pagado</span>
                    </label>

                    {/* margen para no chocar con el chip */}
                    <div className="flex items-start gap-3 mt-6">
                      <div className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-tecnm-azul/10 text-tecnm-azul font-bold">
                        {eq.nombreEquipo?.slice(0, 2)?.toUpperCase() || "EQ"}
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
                            {eq.integrantes?.length ? (
                              eq.integrantes.map((n, i) => <li key={i}>{n}</li>)
                            ) : (
                              <li>—</li>
                            )}
                          </ul>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                          <Info label="Contacto" value={eq.contactoEquipo} />
                          <Info label="Maestro asesor" value={eq.maestroAsesor} />
                          <Info label="Institución" value={eq.institucion} />
                          <Info label="Escolaridad" value={eq.escolaridad} />
                          <Info label="Teléfono" value={eq.telefono} />
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-2 mt-3">
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setViewEq(eq)}>
                            Ver
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditEq(eq)}>
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full text-rose-600"
                            onClick={() => eliminarEquipo(eq)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal VER */}
        <AnimatePresence>
          {viewEq && (
            <>
              <motion.div className="fixed inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewEq(null)} />
              <motion.div className="fixed inset-0 grid place-items-center p-4" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
                <Card className="w-full max-w-lg p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Detalle del equipo</h3>
                    <Button variant="outline" size="sm" onClick={() => setViewEq(null)}>
                      Cerrar
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <Info label="Equipo" value={viewEq.nombreEquipo} />
                    <Info label="Líder" value={viewEq.nombreLider} />
                    <Info label="Correo" value={viewEq.contactoEquipo} />
                    <Info label="Categoría" value={viewEq.categoria} />
                    <Info label="Integrantes" value={(viewEq.integrantes || []).join(", ")} />
                    <Info label="Maestro asesor" value={viewEq.maestroAsesor} />
                    <Info label="Institución" value={viewEq.institucion} />
                    <Info label="Teléfono" value={viewEq.telefono} />
                    <Info label="Escolaridad" value={viewEq.escolaridad} />
                    <Info label="Pago" value={viewEq.pagado ? "Pagado" : "Pendiente"} />
                  </div>
                </Card>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Modal EDITAR */}
        <AnimatePresence>
          {editEq && (
            <>
              <motion.div className="fixed inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditEq(null)} />
              <motion.div className="fixed inset-0 grid place-items-center p-4" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
                <Card className="w-full max-w-2xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Editar equipo</h3>
                    <Button variant="outline" size="sm" onClick={() => setEditEq(null)}>
                      Cerrar
                    </Button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-2 mt-3">
                    <Field label="Nombre del equipo">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.nombreEquipo || ""} onChange={(e) => setEditEq({ ...editEq, nombreEquipo: e.target.value })} />
                    </Field>
                    <Field label="Nombre del líder">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.nombreLider || ""} onChange={(e) => setEditEq({ ...editEq, nombreLider: e.target.value })} />
                    </Field>
                    <Field label="Correo del equipo">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.contactoEquipo || ""} onChange={(e) => setEditEq({ ...editEq, contactoEquipo: e.target.value })} />
                    </Field>
                    <Field label="Categoría">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.categoria || ""} onChange={(e) => setEditEq({ ...editEq, categoria: e.target.value })} />
                    </Field>
                    <Field label="Integrantes (coma)">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={(editEq.integrantes || []).join(", ")}
                        onChange={(e) =>
                          setEditEq({
                            ...editEq,
                            integrantes: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </Field>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-700 inline-flex items-center gap-2">
                        <input type="checkbox" checked={!!editEq.pagado} onChange={(e) => setEditEq({ ...editEq, pagado: e.target.checked })} />
                        Pagado
                      </label>
                    </div>

                    <Field label="Maestro asesor">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.maestroAsesor || ""} onChange={(e) => setEditEq({ ...editEq, maestroAsesor: e.target.value })} />
                    </Field>
                    <Field label="Institución">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.institucion || ""} onChange={(e) => setEditEq({ ...editEq, institucion: e.target.value })} />
                    </Field>
                    <Field label="Teléfono">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.telefono || ""} onChange={(e) => setEditEq({ ...editEq, telefono: e.target.value })} />
                    </Field>
                    <Field label="Escolaridad">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={editEq.escolaridad || ""} onChange={(e) => setEditEq({ ...editEq, escolaridad: e.target.value })} />
                    </Field>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditEq(null)}>
                      Cancelar
                    </Button>
                    <Button onClick={guardarEdicion} disabled={savingEdit}>
                      {savingEdit ? "Guardando…" : "Guardar cambios"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-600">{label}</label>
      {children}
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className={`${modalInset} p-2`}>
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
  onAddCoord,
}: {
  c: Concurso
  onOpenEquipos: (c: Concurso) => void
  onEdit: (c: Concurso) => void
  onAddCoord: (c: Concurso) => void
}) {
  const navigate = useNavigate()
  const tone: "azul" | "gris" | "verde" = c.estatus === "Activo" ? "azul" : c.estatus === "Próximo" ? "gris" : "verde"

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card
        className={`p-0 overflow-hidden cursor-pointer border-0 ${neoSurface} transition`}
        onClick={() => onOpenEquipos(c)}
      >
        {/* Portada */}
        {c.portadaUrl ? (
          <div className="h-40 w-full bg-gray-100">
            <img src={c.portadaUrl} alt="portada" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-2 w-full bg-gradient-to-r from-gray-50 to-white" />
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
                {c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString() : "—"} —{" "}
                {c.fechaFin ? new Date(c.fechaFin).toLocaleDateString() : "—"}
              </p>
              {c.instructor && <p className="text-sm text-gray-700 mt-1 truncate">{c.instructor}</p>}
              {c.sede && <p className="text-xs text-gray-600 truncate">{c.sede}</p>}
            </div>
          </div>

          {/* Acciones con iconitos */}
          <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            <IconBtn title="Editar" variant="primary" onClick={() => onEdit(c)}>
              <Pencil size={18} />
            </IconBtn>
            <IconBtn title="Plantillas" onClick={() => navigate(`/plantillas?concursoId=${c.id}`)}>
              <Layers size={18} />
            </IconBtn>
            <IconBtn title="Constancias" onClick={() => navigate(`/constancias?concursoId=${c.id}`)}>
              <FileText size={18} />
            </IconBtn>
            <IconBtn title="Añadir coordinador" onClick={() => onAddCoord(c)}>
              <UserPlus size={18} />
            </IconBtn>
            <IconBtn title="Asistencia & Pago" variant="primary" onClick={() => navigate(`/asistencias?concursoId=${c.id}`)}>
              <HandCoins size={18} />
            </IconBtn>
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

  // Modal coordinador
  const [addCoordOpen, setAddCoordOpen] = useState(false)
  const [cursoCoord, setCursoCoord] = useState<Concurso | null>(null)
  const abrirAddCoord = (c: Concurso) => { setCursoCoord(c); setAddCoordOpen(true) }

  const abrirCrear = () => {
    setEditCurso({
      id: "__new__",
      nombre: "",
      categoria: "",
      sede: "Por definir",
      fechaInicio: toISO(new Date()),
      fechaFin: toISO(new Date()),
      estatus: "Activo",
      participantesActual: 0,
      participantesMax: 30,
      descripcion: "",
      instructor: "",
      tipoCurso: "grupos",
      portadaUrl: "",
    })
    setEditOpen(true)
  }

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
          const pagado = !!data.pagado

          equiposAcumulados.push({
            id: r.id,
            _respId: r.id,
            _encuestaId: encDoc.id,
            pagado,
            nombreEquipo, nombreLider, integrantes, contactoEquipo, categoria, submittedAt,
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
    <section className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concursos</h1>
          <p className="text-sm text-gray-600">Gestiona equipos, plantillas y constancias por concurso.</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="solid"
            className="rounded-full px-4 py-2 text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
            onClick={abrirCrear}
          >
            Nuevo curso
          </Button>
          <Link to="/" className="text-sm text-tecnm-azul hover:underline">Volver al inicio</Link>
        </div>
      </div>

      {/* Barra de acciones */}
      <Card className={`p-4 border-0 ${neoSurface} overflow-visible`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible py-1 -mx-1 px-1">
            {["Todos", "Activo", "Próximo", "Finalizado"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`${pill} px-4 py-1.5 text-sm transition`}
                style={
                  tab === t
                    ? { background: "linear-gradient(90deg, var(--tw-gradient-from), var(--tw-gradient-to))" }
                    : {}
                }
              >
                <span className={tab === t ? "text-white" : "text-gray-700"}>
                  <span className={tab === t ? "bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 bg-clip-text text-transparent" : ""}>
                    {t}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className={`${pill} flex items-center gap-2 bg-white px-3 py-2 shadow-inner ring-1 ring-gray-200`}>
              <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-70">
                <path d="M21 21l-4.35-4.35m1.35-4.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, sede o categoría…" className="w-56 md:w-72 outline-none text-sm bg-transparent" />
            </div>

            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${pill} bg-white px-3 py-2 text-sm`}>
              {(["Todas", ...Array.from(new Set(concursos.map((c) => c.categoria || "General")))]).map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
            </select>

            <Button variant="outline" className={`${pill} px-4 py-2`} onClick={() => { setBusqueda(""); setCategoria("Todas"); setTab("Todos"); }}>
              Restablecer filtros
            </Button>
          </div>
        </div>
      </Card>

      {cargando && <Card className={`${neoInset} p-8 text-center text-sm text-gray-600`}>Cargando concursos…</Card>}
      {error && !cargando && <Card className={`${neoInset} p-8 text-center text-sm text-rose-600`}>{error}</Card>}

      {!cargando && !error && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Resultados: <strong>{resultados.length}</strong></span>
        </div>
      )}

      {!cargando && !error && (
        resultados.length === 0 ? (
          <Card className={`${neoInset} p-8 text-center text-sm text-gray-600`}>No se encontraron concursos con esos filtros.</Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {resultados.map((c) => (
              <TarjetaConcurso
                key={c.id}
                c={c}
                onOpenEquipos={abrirEquipos}
                onEdit={abrirEditar}
                onAddCoord={(cc) => { setCursoCoord(cc); setAddCoordOpen(true) }}
              />
            ))}
          </div>
        )
      )}

      {/* Modales */}
      <ModalEquipos
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        concurso={concursoSel}
        equipos={equipos}
        cargando={equiposLoading}
        error={equiposError}
      />
      <EditCursoModal open={editOpen} onClose={() => setEditOpen(false)} curso={editCurso} onSaved={onSavedPatch} />
      <AddCoordinadorModal open={addCoordOpen} onClose={() => setAddCoordOpen(false)} curso={cursoCoord} />
    </section>
  )
}

/* ---------------- Modal AÑADIR COORDINADOR ---------------- */
function AddCoordinadorModal({
  open,
  onClose,
  curso,
}: {
  open: boolean
  onClose: () => void
  curso: Concurso | null
}) {
  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState("")
  const [correo, setCorreo] = useState("")
  const [cargo, setCargo] = useState("Coordinador")
  const [telefono, setTelefono] = useState("")

  useEffect(() => {
    if (!open) {
      setNombre("")
      setCorreo("")
      setCargo("Coordinador")
      setTelefono("")
    }
  }, [open])

  const guardar = async () => {
    if (!curso) return
    if (!nombre.trim() || !correo.trim() || !cargo.trim()) {
      alert("Completa nombre, correo y cargo.")
      return
    }
    try {
      setSaving(true)
      await addDoc(collection(db, "coordinadores"), {
        cursoId: curso.id,
        concursoNombre: curso.nombre ?? "",
        nombre: nombre.trim(),
        email: correo.trim(),
        cargo: cargo.trim(),
        telefono: telefono.trim() || null,
        creadoEn: serverTimestamp(),
      })
      onClose()
    } catch (e) {
      console.error(e)
      alert("No se pudo guardar el coordinador.")
    } finally {
      setSaving(false)
    }
  }

  if (!open || !curso) return null

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        <div className={`${modalSurface} w-full max-w-md overflow-hidden`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Añadir Coordinador</h2>
            <button className={`${pill} h-9 px-3 text-sm`} onClick={onClose} aria-label="Cerrar">✕</button>
          </div>

          <div className="p-5 space-y-3">
            {[
              { label: "Nombre", type: "text", value: nombre, set: setNombre, ph: "Nombre completo" },
              { label: "Correo", type: "email", value: correo, set: setCorreo, ph: "correo@ejemplo.com" },
              { label: "Cargo", type: "text", value: cargo, set: setCargo, ph: "Coordinador" },
              { label: "Teléfono", type: "tel", value: telefono, set: setTelefono, ph: "(xxx) xxx xxxx" },
            ].map((f, i) => (
              <div key={i}>
                <label className="text-sm text-gray-600">{f.label}</label>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.ph}
                  className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
            <Button variant="outline" className={`${pill} px-4 py-2`} onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button
              variant="solid"
              className="rounded-full px-5 py-2 text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
              onClick={guardar}
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
