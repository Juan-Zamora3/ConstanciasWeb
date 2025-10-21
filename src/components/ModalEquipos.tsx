// src/components/ModalEquipos.tsx
import React, { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Card } from "./ui/Card"
import Button from "./ui/Button"

// Firebase
import { db } from "../servicios/firebaseConfig"
import {
  addDoc,
  collection,
  deleteDoc,
  doc as fsDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore"

/* ===== Tipos mínimos para que el componente sea independiente ===== */
export type Concurso = {
  id: string
  nombre?: string
  categoria?: string
  sede?: string
}

export type Equipo = {
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
  _encuestaId?: string
  _respId?: string
}

/* ===== Helpers UI ===== */
const pill =
  "relative rounded-full bg-white border border-white/60 shadow-[0_8px_24px_rgba(2,6,23,0.06)] " +
  "before:content-[''] before:absolute before:inset-px before:rounded-full before:pointer-events-none " +
  "before:shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"

const modalInset =
  "rounded-xl bg-gradient-to-br from-white to-gray-50 ring-1 ring-gray-200 shadow-inner shadow-black/10"

function Chip({
  children,
  tone = "gris",
}: { children: React.ReactNode; tone?: "azul" | "gris" | "verde" }) {
  const map = {
    azul: `${pill} px-3 py-1 text-[11px] font-medium bg-white text-tecnm-azul`,
    gris: `${pill} px-3 py-1 text-[11px] font-medium bg-white text-gray-700`,
    verde: `${pill} px-3 py-1 text-[11px] font-medium bg-white text-tecnm-gris10`,
  }
  return <span className={map[tone]}>{children}</span>
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

/* ===== Componente ===== */
export default function ModalEquipos({
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

  useEffect(() => { setLista(equiposProp || []) }, [equiposProp])

  useEffect(() => {
    (async () => {
      if (!open || !concurso?.id) return
      try {
        const qEnc = query(collection(db, "encuestas"), where("cursoId", "==", concurso.id))
        const snap = await getDocs(qEnc)
        const rows = snap.docs.map((d) => ({ id: d.id, titulo: (d.data() as any)?.titulo || d.id }))
        setEncuestas(rows)
        setEncuestaDestino(rows[0]?.id || "")
      } catch {
        setEncuestas([]); setEncuestaDestino("")
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

  const totalParticipantes = React.useMemo(() => {
    return filtrados.reduce((acc, eq) => {
      const integrantes = Array.isArray(eq.integrantes) ? eq.integrantes.length : 0
      const lider = eq.nombreLider?.trim() ? 1 : 0
      return acc + integrantes + lider
    }, 0)
  }, [filtrados])

  const togglePagado = async (eq: Equipo, val: boolean) => {
    if (!eq._encuestaId || !eq._respId) return alert("No se puede actualizar este registro.")
    try {
      await updateDoc(fsDoc(db, "encuestas", eq._encuestaId, "respuestas", eq._respId), { pagado: val })
      setLista((prev) => prev.map((x) => (x._respId === eq._respId ? { ...x, pagado: val } : x)))
    } catch {
      alert("No se pudo actualizar el estado de pago.")
    }
  }

  const eliminarEquipo = async (eq: Equipo) => {
    if (!eq._encuestaId || !eq._respId) return alert("No se puede eliminar este registro.")
    if (!confirm(`¿Eliminar el equipo "${eq.nombreEquipo}"?`)) return
    try {
      await deleteDoc(fsDoc(db, "encuestas", eq._encuestaId, "respuestas", eq._respId))
      setLista((prev) => prev.filter((x) => x._respId !== eq._respId))
    } catch {
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
        custom: { p1: editEq.maestroAsesor || "", p2: editEq.institucion || "", p3: editEq.telefono || "", p4: editEq.escolaridad || "" },
        pagado: !!editEq.pagado,
      }
      await updateDoc(fsDoc(db, "encuestas", editEq._encuestaId, "respuestas", editEq._respId), patch)
      setLista((prev) => prev.map((x) => (x._respId === editEq._respId ? { ...x, ...editEq } : x)))
      setEditEq(null)
    } finally { setSavingEdit(false) }
  }

  const añadirRapido = async () => {
    if (!encuestaDestino) return alert("Selecciona una encuesta destino.")
    try {
      setSavingAdd(true)
      const integrantes = aIntegrantes.split(",").map((s) => s.trim()).filter(Boolean)
      const payload = {
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        pagado: aPagado,
        preset: { nombreEquipo: aNombreEquipo.trim() || "Equipo", nombreLider: aNombreLider.trim() || "", contactoEquipo: aEmail.trim() || "", categoria: aCategoria.trim() || "", integrantes },
        custom: { p1: aAsesor.trim() || "", p2: aInstitucion.trim() || "", p3: aTelefono.trim() || "", p4: aEscolaridad.trim() || "" },
      }
      const refDoc = await addDoc(collection(db, "encuestas", encuestaDestino, "respuestas"), payload)
      const nuevo: Equipo = {
        id: refDoc.id, _respId: refDoc.id, _encuestaId: encuestaDestino, pagado: aPagado,
        nombreEquipo: payload.preset.nombreEquipo, nombreLider: payload.preset.nombreLider, integrantes,
        contactoEquipo: payload.preset.contactoEquipo, categoria: payload.preset.categoria,
        submittedAt: new Date().toISOString(), maestroAsesor: payload.custom.p1, institucion: payload.custom.p2, telefono: payload.custom.p3, escolaridad: payload.custom.p4,
      }
      setLista((prev) => [nuevo, ...prev])
      setANombreEquipo(""); setANombreLider(""); setAEmail(""); setACategoria(""); setAIntegrantes(""); setAAsesor(""); setAInstitucion(""); setATelefono(""); setAEscolaridad(""); setAPagado(false)
      setAddingOpen(false)
    } finally { setSavingAdd(false) }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      {/* overlay con glass y sombra intensa */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        {/* contenedor con ring + sombra gorda + glass */}
        <div
          className="relative w-full max-w-6xl overflow-hidden rounded-[22px]
                     bg-white/95 backdrop-blur-xl ring-1 ring-slate-200
                     shadow-[0_40px_120px_rgba(2,6,23,0.35),0_10px_30px_rgba(2,6,23,0.18)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* barrita de acento arriba */}
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700" />

          {/* header sticky “glass” */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4
                          bg-white/90 backdrop-blur border-b border-slate-200">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">Equipos – {concurso?.nombre ?? "Concurso"}</h2>
              <p className="text-xs text-gray-500 truncate">
                {concurso?.categoria ?? "Categoría"} · {concurso?.sede ?? "Sede"}
              </p>
            </div>
            <button
              className="h-9 w-9 grid place-items-center rounded-full bg-white ring-1 ring-slate-200 shadow
                         hover:ring-tecnm-azul/40 active:scale-95"
              onClick={onClose} aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* contenido scrollable */}
          <div className="p-5 space-y-4 max-h-[78vh] overflow-auto">
            {/* Barra superior: buscador + contadores + añadir rápido */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className={`${pill} flex items-center gap-2 bg-white px-3 py-2 shadow-inner w-full md:w-auto ring-1 ring-gray-200
                                focus-within:ring-tecnm-azul/35`}>
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

              {/* chips de conteo */}
              <div className="flex items-center gap-2 text-xs">
                <span className={`${pill} px-3 py-1 text-slate-700 ring-1 ring-slate-200`}>Equipos: <strong className="ml-1">{filtrados.length}</strong></span>
                <span className={`${pill} px-3 py-1 text-slate-700 ring-1 ring-slate-200`}>Participantes: <strong className="ml-1">{totalParticipantes}</strong></span>
              </div>

              <div className="flex-1" />

              <Button variant="outline" className={`${pill} px-4 py-2`} onClick={() => setAddingOpen(v => !v)}>
                {addingOpen ? "Cerrar añadir" : "Añadir rápido"}
              </Button>
            </div>

            {/* Añadir rápido */}
            {addingOpen && (
              <Card className={`${modalInset} p-3 ring-1 ring-slate-200`}>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Encuesta destino</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      value={encuestaDestino}
                      onChange={(e) => setEncuestaDestino(e.target.value)}
                    >
                      {encuestas.length === 0
                        ? <option value="">(No hay encuestas para este curso)</option>
                        : encuestas.map((e) => <option key={e.id} value={e.id}>{e.titulo || e.id}</option>)
                      }
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
                  <Button variant="outline" onClick={() => setAddingOpen(false)}>Cancelar</Button>
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
                  <Card
                    key={eq.id}
                    className={`relative p-4 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm
                                hover:shadow-lg hover:ring-tecnm-azul/30 transition`}
                  >
                    {/* chip de pagado con color */}
                    <label
                      className={`absolute top-2 right-2 z-10 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium
                                  border ring-1 shadow-sm
                                  ${eq.pagado
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200"
                                    : "bg-white/95 text-slate-700 border-slate-200 ring-slate-200"}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!eq.pagado}
                        onChange={(e) => togglePagado(eq, e.target.checked)}
                      />
                      <span>Pagado</span>
                    </label>

                    {/* contenido */}
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

                        <div className="flex items-center gap-2 mt-3">
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setViewEq(eq)}>Ver</Button>
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditEq(eq)}>Editar</Button>
                          <Button variant="outline" size="sm" className="rounded-full text-rose-600" onClick={() => eliminarEquipo(eq)}>Eliminar</Button>
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
              <motion.div className="fixed inset-0 bg-slate-900/60 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewEq(null)} />
              <motion.div className="fixed inset-0 grid place-items-center p-4" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
                <Card className="w-full max-w-lg p-4 rounded-2xl ring-1 ring-slate-200 shadow-xl bg-white/95 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Detalle del equipo</h3>
                    <Button variant="outline" size="sm" onClick={() => setViewEq(null)}>Cerrar</Button>
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
              <motion.div className="fixed inset-0 bg-slate-900/60 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditEq(null)} />
              <motion.div className="fixed inset-0 grid place-items-center p-4" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
                <Card className="w-full max-w-2xl p-4 rounded-2xl ring-1 ring-slate-200 shadow-xl bg-white/95 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Editar equipo</h3>
                    <Button variant="outline" size="sm" onClick={() => setEditEq(null)}>Cerrar</Button>
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
                            integrantes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
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
                    <Button variant="outline" onClick={() => setEditEq(null)}>Cancelar</Button>
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
