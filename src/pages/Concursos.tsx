// src/pages/Concursos.tsx
import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { Link, useNavigate } from "react-router-dom"

// Modales / iconos
import ModalEquipos, { type Equipo as EquipoModal } from "../components/ModalEquipos"
import { Pencil, Layers, FileText, UserPlus, HandCoins, Trash2 } from "lucide-react"

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

const SHOW_CARD_ACTIONS = false; // ponlo en true si quieres ver los botones


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

/* ---------- UI helpers ---------- */
const neoSurface = [
  "relative rounded-2xl",
  "bg-white",
  "ring-1 ring-slate-200",
  "shadow-[0_6px_16px_rgba(2,6,23,0.06),0_1px_2px_rgba(2,6,23,0.04)]",
  "transition-transform duration-200 will-change-transform",
  "hover:shadow-[0_16px_40px_rgba(2,6,23,0.12),0_2px_6px_rgba(2,6,23,0.08)]",
  "hover:ring-tecnm-azul/30 hover:-translate-y-0.5",
].join(" ")

const neoInset = [
  "rounded-xl",
  "bg-gradient-to-br from-white to-gray-50",
  "ring-1 ring-gray-200",
  "shadow-inner shadow-black/10",
].join(" ")

const modalSurface = `${neoSurface} ring-slate-200`
const modalInset   = `${neoInset}`

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

/* Barra de progreso inferior */
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
  variant?: "primary" | "outline" | "danger"
  children: React.ReactNode
}) {
  const base =
    "h-9 w-9 grid place-items-center rounded-full transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-tecnm-azul/30"

  const styles =
    variant === "primary"
      ? "text-white bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 shadow-soft"
      : variant === "danger"
      ? `${pill} bg-white text-rose-600 hover:bg-rose-50`
      : `${pill} bg-white text-tecnm-azul hover:brightness-[1.02]`

  return (
    <button
      type="button"
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

/* ---------- Helpers de participantes (nivel superior) ---------- */
/** Cuenta participantes de una respuesta: integrantes + (1 si hay líder) o usa "cantidadParticipantes" si existe */
function contarParticipantesRespuesta(d: any): number {
  const preset = (d?.preset || {}) as any
  const integrantes = Array.isArray(preset.integrantes)
    ? preset.integrantes.filter(Boolean)
    : Array.isArray(d?.integrantes)
      ? (d.integrantes as any[]).filter(Boolean)
      : []
  const lider = (preset.nombreLider || d?.nombreLider || "").toString().trim()
  const cantExpl = Number(d?.cantidadParticipantes ?? preset?.cantidadParticipantes)
  if (!isNaN(cantExpl) && cantExpl > 0) return cantExpl
  return integrantes.length + (lider ? 1 : 0)
}

/** Suma participantes de TODAS las encuestas de un curso */
async function calcularParticipantesCurso(cursoId: string): Promise<number> {
  let total = 0
  const qEnc = query(collection(db, "encuestas"), where("cursoId", "==", cursoId))
  const encSnap = await getDocs(qEnc)
  for (const encDoc of encSnap.docs) {
    const respSnap = await getDocs(collection(fsDoc(db, "encuestas", encDoc.id), "respuestas"))
    respSnap.forEach((r) => { total += contarParticipantesRespuesta(r.data() || {}) })
  }
  return total
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


  const MODAL_UI = {
    maxW: "max-w-[1280px]",
    maxH: "max-h-[82vh]",
    overlay: "bg-tecnm-azul/15",
    ring: "ring-tecnm-azul/20",
    headBorder: "border-tecnm-azul/20",
    headBg: "bg-white/90",
  }

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

        onSaved({})
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
        className={`fixed inset-0 z-50 bg-tecnm-azul/15 backdrop-blur-sm`}
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
          className={`${modalSurface} w/full max-w-3xl overflow-hidden`}
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
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
  onDelete,
}: {
  c: Concurso
  onOpenEquipos: (c: Concurso) => void
  onEdit: (c: Concurso) => void
  onAddCoord: (c: Concurso) => void
  onDelete?: (c: Concurso) => void
}) {
  const navigate = useNavigate()
  const tone: "azul" | "gris" | "verde" =
    c.estatus === "Activo" ? "azul" : c.estatus === "Próximo" ? "gris" : "verde"

  const accent =
    tone === "azul"
      ? "from-tecnm-azul to-tecnm-azul-700"
      : tone === "verde"
      ? "from-emerald-500 to-emerald-700"
      : "from-slate-400 to-slate-600"

  const pct = Math.min(100, Math.round((c.participantesActual / Math.max(1, c.participantesMax)) * 100))

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card
        className={`group relative p-0 overflow-hidden cursor-pointer border-0 ${neoSurface} transform-gpu`}
        onClick={() => onOpenEquipos(c)}
      >
        {/* acento lateral */}
        <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${accent}`} />

        {/* ✅ barra superior de progreso */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/5">
          <div
            className={`h-full bg-gradient-to-r ${accent} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Portada */}
        {c.portadaUrl ? (
          <div className="h-40 w-full relative bg-slate-100">
            <img src={c.portadaUrl} alt="portada" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
          </div>
        ) : (
          <div className={`h-2 w-full bg-gradient-to-r from-gray-50 to-white`} />
        )}

        {/* Contenido */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl grid place-items-center font-bold shrink-0
                            text-tecnm-azul bg-tecnm-azul/10 ring-1 ring-slate-200">
              {c.categoria?.slice(0, 2)?.toUpperCase() || "CO"}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[15px] leading-tight truncate">
                  {c.nombre || "Concurso"}
                </h3>
                <Chip tone={tone}>{c.estatus}</Chip>
              </div>

              <p className="text-xs text-gray-500 mt-0.5">
                {c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString() : "—"} —{" "}
                {c.fechaFin ? new Date(c.fechaFin).toLocaleDateString() : "—"}
              </p>

              {c.instructor && (
                <p className="text-sm text-gray-700 mt-1 truncate">{c.instructor}</p>
              )}
              {c.sede && <p className="text-xs text-gray-600 truncate">{c.sede}</p>}
            </div>
          </div>

          {/* Acciones */}
          {SHOW_CARD_ACTIONS && (
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
    {onDelete && (
      <IconBtn title="Eliminar" variant="danger" onClick={() => onDelete(c)}>
        <Trash2 size={18} />
      </IconBtn>
    )}
  </div>
)}


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
  const [equipos, setEquipos] = useState<EquipoModal[]>([])
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
        async (snap) => {
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

          setConcursos(rows)
          setCargando(false)
          setError(null)

          // 🔄 Recalcular participantes reales desde encuestas
          try {
            const pares = await Promise.all(
              rows.map(async (c) => [c.id, await calcularParticipantesCurso(c.id)] as const)
            )
            setConcursos((prev) =>
              prev.map((c) => {
                const hit = pares.find(([id]) => id === c.id)
                return hit ? { ...c, participantesActual: hit[1] } : c
              })
            )
          } catch (aggErr) {
            console.error("No se pudieron calcular participantes:", aggErr)
          }
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
      const equiposAcumulados: EquipoModal[] = []
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
    } catch (e) {
      console.error(e)
      setEquiposError("No fue posible cargar los equipos de este concurso.")
    } finally {
      setEquiposLoading(false)
    }
  }

  /* ----------- Abrir modal EDITAR ----------- */
  const abrirEditar = (c: Concurso) => { setEditCurso(c); setEditOpen(true) }
  const eliminarConcurso = async (c: Concurso) => {
    const ok = confirm(`¿Eliminar el curso "${c.nombre}"? Esta acción no se puede deshacer.`)
    if (!ok) return
    try {
      setConcursos(prev => prev.filter(x => x.id !== c.id)) // optimista
      await deleteDoc(fsDoc(db, "Cursos", c.id))
    } catch (e) {
      console.error(e)
      alert("No se pudo eliminar el curso.")
      setConcursos(prev => [...prev, c]) // revertir
    }
  }

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
          
          <Link to="/" className="text-sm text-tecnm-azul hover:underline">Volver al inicio</Link>
        </div>
      </div>

      {/* Barra de acciones */}
      <Card
        className={`p-4 border-0 ${neoSurface} overflow-visible
                    sticky top-2 z-30 bg-white/90 backdrop-blur
                    supports-[backdrop-filter]:bg-white/70`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible py-1 -mx-1 px-1">
            {["Todos", "Activo", "Próximo", "Finalizado"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`${pill} px-4 py-1.5 text-sm transition ring-1
                ${tab === t
                  ? "bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 text-white ring-tecnm-azul/40 shadow-md"
                  : "text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
              >
                {t}
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
                onDelete={eliminarConcurso}
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
/* ---------------- Modal AÑADIR COORDINADOR (GLOBAL) ---------------- */
function AddCoordinadorModal({
  open,
  onClose,
  curso, // puede venir o no; ya no lo usamos para guardar
}: {
  open: boolean
  onClose: () => void
  curso: Concurso | null
}) {
  const TIPOS_CARGO = [
    "Coordinación General",
    "Coordinador de Promoción",
    "Coordinación de Patrocinios",
    "Coordinación de Logística",
    "Coordinación de Constancias y Premios",
    "Coordinador Técnico",
    "Coordinador de Difusión",
    "Colaborador en Coordinación",
    "Colaborador de Logística",
    "Colaborador en Sistema de registro Equipos participantes",
    "Colaborador en el sistema generador de Constancias",
    "Colaborador de Edecanes",
    "Maestra de Ceremonias",
    "Coordinador de Edecanes",
  ] as const

  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState("")
  const [correo, setCorreo] = useState("")
  const [cargo, setCargo] = useState<string>("Coordinación General")

  useEffect(() => {
    if (!open) {
      setNombre("")
      setCorreo("")
      setCargo("Coordinación General")
    }
  }, [open])

  const guardar = async () => {
    if (!nombre.trim() || !correo.trim() || !cargo.trim()) {
      alert("Completa nombre, correo y cargo.")
      return
    }
    try {
      setSaving(true)
      // 🔁 GUARDADO GLOBAL: sin cursoId ni concursoNombre
      await addDoc(collection(db, "coordinadores"), {
        nombre: nombre.trim(),
        email: correo.trim(),
        cargo: cargo.trim(),
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

  // 👇 ya no exigimos curso; el modal puede abrirse desde cualquier lado
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
        <div className={`${modalSurface} w-full max-w-md overflow-hidden`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Añadir Coordinador</h2>
            <button className={`${pill} h-9 px-3 text-sm`} onClick={onClose} aria-label="Cerrar">✕</button>
          </div>

          <div className="p-5 space-y-3">
            <div>
              <label className="text-sm text-gray-600">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo"
                className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Correo</label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.com"
                className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Cargo</label>
              <select
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                className={`${modalInset} mt-1 w-full px-3 py-2 outline-none focus:ring-2 focus:ring-tecnm-azul/20`}
              >
                {TIPOS_CARGO.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
            <Button variant="outline" className={`${pill} px-4 py-2`} onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
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

