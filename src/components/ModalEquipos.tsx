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
  updateDoc,
  where,
    setDoc, // 👈 NUEVO
} from "firebase/firestore"
import { pagarEquipo } from "../pages/Asistencias"
/* ===== Tipos mínimos ===== */
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

function mergeWithLeaderNames(integrantes: string[] = [], lider?: string) {
  const out = [...(integrantes || [])]
  const l = (lider || "").trim()
  if (l && !out.some((n) => n.trim().toLowerCase() === l.toLowerCase())) out.push(l)
  return out
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

  // estado del modal de detalles (seleccionado) + modo edición
  const [detailEq, setDetailEq] = useState<Equipo | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const [snapshotEq, setSnapshotEq] = useState<Equipo | null>(null) // para Cancelar

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

  const totalParticipantes = useMemo(() => {
    return filtrados.reduce((acc, eq) => {
      const integrantes = Array.isArray(eq.integrantes) ? eq.integrantes.length : 0
      const lider = eq.nombreLider?.trim() ? 1 : 0
      return acc + integrantes + lider
    }, 0)
  }, [filtrados])

const togglePagado = async (eq: Equipo, val: boolean) => {
  if (!eq._encuestaId || !eq._respId) return alert("No se puede actualizar este registro.")
  const equipoDocId = eq._respId || eq.id

  try {
    if (val) {
      if (!concurso?.id) return alert("Falta el cursoId para registrar el pago.")
      const miembros = mergeWithLeaderNames(eq.integrantes, eq.nombreLider)

      // 1) Fallback inmediato en Asistencias (por si pagarEquipo falla o se demora)
      await setDoc(
        fsDoc(db, "Cursos", concurso.id, "asistencias", equipoDocId),
        {
          cursoId: concurso.id,
          cursoNombre: concurso?.nombre || "Curso",
          equipoId: equipoDocId,
          nombreEquipo: eq.nombreEquipo,
          updatedAt: serverTimestamp(),
          asistencia: {
            presentes: miembros,
            totalPresentes: miembros.length,
            integrantesTotales: miembros.length,
          },
          pago: {
            requierePago: true,
            cuotaEquipo: 100,           // 👈 ajusta si tu cuota es otra
            totalEsperado: 100,
            montoEntregado: 100,
            cambioEntregado: 0,
            netoCobrado: 100,
            aplicadoAEsperado: 100,
            faltante: 0,
            metodo: "Efectivo",
            folio: null,
            pagado: true,
            fechaPago: serverTimestamp(),
          },
          categoria: eq.categoria || null,
          nombreLider: eq.nombreLider || null,
          contactoEquipo: eq.contactoEquipo || null,
          institucion: eq.institucion || null,
        },
        { merge: true }
      )

      // 2) Registro “bonito” usando tu helper (deja todo coherente)
      await pagarEquipo({
        cursoId: concurso.id,
        cursoNombre: concurso?.nombre || "Curso",
        equipo: {
          id: equipoDocId,
          nombreEquipo: eq.nombreEquipo,
          integrantes: miembros,
          nombreLider: eq.nombreLider,
          categoria: eq.categoria,
          contactoEquipo: eq.contactoEquipo,
          institucion: eq.institucion,
        },
        presentes: miembros,
        cuota: 100,                      // 👈 ajusta si tu cuota es otra
        metodo: "Efectivo",
      })
    } else {
      // Desmarcar: deja explícitamente pagado:false y limpia importes
      if (concurso?.id) {
        await setDoc(
          fsDoc(db, "Cursos", concurso.id, "asistencias", equipoDocId),
          {
            pago: {
              pagado: false,
              montoEntregado: 0,
              netoCobrado: 0,
              aplicadoAEsperado: 0,
              cambioEntregado: 0,
              faltante: 0,
            },
          },
          { merge: true }
        )
      }
    }

    // Refleja en la respuesta de la encuesta
    await updateDoc(fsDoc(db, "encuestas", eq._encuestaId, "respuestas", eq._respId), { pagado: val })

    // Actualiza UI local
    setLista((prev) => prev.map((x) => (x._respId === eq._respId ? { ...x, pagado: val } : x)))
    setDetailEq((curr) => (curr && curr._respId === eq._respId ? { ...curr, pagado: val } : curr))
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
      setDetailEq(null); setIsEditing(false)
    } catch {
      alert("No se pudo eliminar.")
    }
  }

  const guardarEdicion = async () => {
  if (!detailEq || !detailEq._encuestaId || !detailEq._respId) return
  try {
    setSavingEdit(true)

    const patch: any = {
      preset: {
        nombreEquipo: detailEq.nombreEquipo || "",
        nombreLider: detailEq.nombreLider || "",
        contactoEquipo: detailEq.contactoEquipo || "",
        categoria: detailEq.categoria || "",
        integrantes: Array.isArray(detailEq.integrantes) ? detailEq.integrantes : [],
      },
      custom: {
        p1: detailEq.maestroAsesor || "",
        p2: detailEq.institucion || "",
        p3: detailEq.telefono || "",
        p4: detailEq.escolaridad || "",
      },
      pagado: !!detailEq.pagado,
    }

    const encDocRef = fsDoc(
      db,
      "encuestas",
      detailEq._encuestaId,
      "respuestas",
      detailEq._respId
    )

    // 1) Guardar edición en la respuesta
    await updateDoc(encDocRef, patch)

    // 2) Sincronizar "pagado" con Asistencias
    if (patch.pagado) {
      if (!concurso?.id) {
        alert("Se marcó como pagado, pero falta cursoId para reflejarlo en Asistencias.")
      } else {
        const miembros = mergeWithLeaderNames(
          patch.preset.integrantes,
          patch.preset.nombreLider
        )
        try {
          await pagarEquipo({
            cursoId: concurso.id,
            cursoNombre: concurso?.nombre || "Curso",
            equipo: {
              id: detailEq._respId, // usamos el id de la respuesta como id del equipo en asistencias
              nombreEquipo: patch.preset.nombreEquipo,
              integrantes: miembros,
              nombreLider: patch.preset.nombreLider,
              categoria: patch.preset.categoria,
              contactoEquipo: patch.preset.contactoEquipo,
              institucion: patch.custom.p2,
            },
            presentes: miembros, // asegura asistencia > 0
            cuota: 100,          // ⚠️ ajusta si tu cuota real es otra
            metodo: "Efectivo",
          })
        } catch (e) {
          console.error(e)
          // Revertir "pagado" si falló registrar el pago en Asistencias
          await updateDoc(encDocRef, { pagado: false })
          patch.pagado = false
          alert("No se pudo registrar el pago en Asistencias. 'Pagado' fue revertido.")
        }
      }
    } else {
      // Desmarcado: reflejar en Asistencias que ya no está pagado
      if (concurso?.id) {
        await setDoc(
          fsDoc(db, "Cursos", concurso.id, "asistencias", detailEq._respId),
          { pago: { pagado: false } },
          { merge: true }
        )
      }
    }

    // 3) Actualizar UI local
    setLista((prev) =>
      prev.map((x) =>
        x._respId === detailEq._respId ? { ...x, ...detailEq, pagado: patch.pagado } : x
      )
    )
    setIsEditing(false)
    setSnapshotEq({ ...detailEq, pagado: patch.pagado })
  } finally {
    setSavingEdit(false)
  }
}


  const cancelarEdicion = () => {
    if (snapshotEq) setDetailEq(snapshotEq)
    setIsEditing(false)
  }

 const añadirRapido = async () => {
  if (!encuestaDestino) return alert("Selecciona una encuesta destino.")
  try {
    setSavingAdd(true)

    // Parseo de integrantes
    const integrantes = aIntegrantes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    // Documento base en respuestas de la encuesta
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

    // 1) Guardar respuesta
    const refDoc = await addDoc(
      collection(db, "encuestas", encuestaDestino, "respuestas"),
      payload
    )

    // 2) Insertar en la lista local
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

    // 3) Si se marcó como pagado, reflejar también en Asistencias
    if (aPagado) {
      if (!concurso?.id) {
        alert(
          "Se marcó como pagado, pero no tengo cursoId para reflejarlo en Asistencias."
        )
      } else {
        const miembros = mergeWithLeaderNames(integrantes, aNombreLider)
        try {
          await pagarEquipo({
            cursoId: concurso.id,
            cursoNombre: concurso?.nombre || "Curso",
            equipo: {
              id: refDoc.id, // usamos el id de la respuesta como id en asistencias
              nombreEquipo: payload.preset.nombreEquipo,
              integrantes: miembros,
              nombreLider: payload.preset.nombreLider,
              categoria: payload.preset.categoria,
              contactoEquipo: payload.preset.contactoEquipo,
              institucion: payload.custom.p2,
            },
            presentes: miembros, // asegura asistencia > 0
            cuota: 100,          // 👈 ajusta si tu cuota es otra
            metodo: "Efectivo",
          })
        } catch (e) {
          console.error(e)
          // Si falló registrar el pago, revertimos a "pendiente" en la respuesta y en UI
          await updateDoc(
            fsDoc(db, "encuestas", encuestaDestino, "respuestas", refDoc.id),
            { pagado: false }
          )
          setLista((prev) =>
            prev.map((x) => (x._respId === refDoc.id ? { ...x, pagado: false } : x))
          )
          alert(
            "El equipo se añadió, pero no se pudo registrar el pago en Asistencias. Quedó como Pendiente."
          )
        }
      }
    }

    // 4) Reset de campos y cerrar bloque
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
    alert("No se pudo añadir el equipo.")
  } finally {
    setSavingAdd(false)
  }
}


  useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (detailEq) { setDetailEq(null); setIsEditing(false); return }
      onClose()
    }
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
}, [detailEq, onClose])


  if (!open) return null

  return (
    <AnimatePresence>
      {/* overlay global del modal principal */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md"
        onClick={() => { setDetailEq(null); setIsEditing(false); onClose() }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        {/* contenedor principal */}
        <div
          className="relative w-full max-w-6xl overflow-hidden rounded-[22px]
                     bg-white/95 backdrop-blur-xl ring-1 ring-slate-200
                     shadow-[0_40px_120px_rgba(2,6,23,0.35),0_10px_30px_rgba(2,6,23,0.18)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* barrita de acento */}
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700" />

          {/* header sticky */}
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
              onClick={() => { setDetailEq(null); setIsEditing(false); onClose() }}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* contenido scrollable */}
          <div className="p-5 space-y-4 max-h-[78vh] overflow-auto">
            {/* Barra superior: búsqueda + contadores + añadir rápido */}
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
                {filtrados.map((eq) => {
                  const iniciales = eq.nombreEquipo?.slice(0, 2)?.toUpperCase() || "EQ"
                  const integrantesCount = Array.isArray(eq.integrantes) ? eq.integrantes.length : 0
                  return (
                    <Card
                      key={eq.id}
                      className="relative p-4 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow-lg hover:ring-tecnm-azul/30 transition cursor-pointer"
                      onClick={() => {
                        setDetailEq(eq)
                        setSnapshotEq(eq) // para cancelar luego
                        setIsEditing(false)
                      }}
                    >
                      {/* chip pagado (no abre modal) */}
                      <label
                        className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium
                                    border ring-1 shadow-sm
                                    ${eq.pagado
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200"
                                      : "bg-white/95 text-slate-700 border-slate-200 ring-slate-200"}`}
                        title="Marcar como pagado"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!eq.pagado}
                          onChange={(e) => togglePagado(eq, e.target.checked)}
                        />
                        <span>{eq.pagado ? "Pagado" : "Pendiente"}</span>
                      </label>

                      {/* contenido compacto */}
                      <div className="flex items-start gap-3 mt-6">
                        <div className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-gradient-to-br from-tecnm-azul/15 to-tecnm-azul/5 text-tecnm-azul font-bold">
                          {iniciales}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="font-semibold truncate">{eq.nombreEquipo || "Equipo"}</h3>
                            {eq.categoria && <Chip tone="azul">{eq.categoria}</Chip>}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 truncate">
                            Líder: {eq.nombreLider || "—"}{eq.institucion ? ` · ${eq.institucion}` : ""}
                          </p>
                          {eq.contactoEquipo && (
                            <p className="text-xs text-gray-500 truncate">{eq.contactoEquipo}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
                            <span className={`${pill} px-2.5 py-1 ring-1 ring-slate-200`}>{integrantesCount} integrantes</span>
                            {eq.submittedAt && (
                              <span className={`${pill} px-2.5 py-1 ring-1 ring-slate-200`}>
                                Enviado: {new Date(eq.submittedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal DETALLES (lectura) + switch a EDICIÓN */}
        <AnimatePresence>
          {detailEq && (
            <>
              {/* Overlay: clic afuera cierra */}
              <motion.div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setDetailEq(null); setIsEditing(false) }}
              />
              <motion.div
                className="fixed inset-0 grid place-items-center p-4"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
              >
                <Card className="w-full max-w-2xl p-4 rounded-2xl ring-1 ring-slate-200 shadow-xl bg-white/95 backdrop-blur" onClick={(e)=>e.stopPropagation()}>
                  {/* Encabezado compacto */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold truncate">Detalles del equipo</h3>
                      <p className="text-xs text-gray-500 truncate">
                        ID: {detailEq._respId || detailEq.id} {detailEq.submittedAt ? `· ${new Date(detailEq.submittedAt).toLocaleString()}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isEditing ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => { setSnapshotEq(detailEq); setIsEditing(true) }}>
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={() => eliminarEquipo(detailEq)}
                          >
                            Eliminar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" onClick={cancelarEdicion}>Cancelar</Button>
                          <Button size="sm" onClick={guardarEdicion} disabled={savingEdit}>
                            {savingEdit ? "Guardando…" : "Guardar"}
                          </Button>
                        </>
                      )}

                      {/* ✕ cerrar */}
                      <button
                        aria-label="Cerrar"
                        onClick={() => { setDetailEq(null); setIsEditing(false) }}
                        className="h-8 w-8 grid place-items-center rounded-full bg-white ring-1 ring-slate-200 shadow hover:ring-tecnm-azul/40 active:scale-95"
                        title="Cerrar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>


                  {/* Cuerpo: misma grilla que “editar”, pero disabled si no está en edición */}
                  <div className="grid md:grid-cols-2 gap-2 mt-3">
                    <Field label="Nombre del equipo">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.nombreEquipo || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, nombreEquipo: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Nombre del líder">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.nombreLider || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, nombreLider: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Correo del equipo">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.contactoEquipo || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, contactoEquipo: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Categoría">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.categoria || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, categoria: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Integrantes (coma)">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={(detailEq.integrantes || []).join(", ")}
                        onChange={(e) =>
                          setDetailEq({
                            ...detailEq,
                            integrantes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Maestro asesor">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.maestroAsesor || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, maestroAsesor: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Institución">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.institucion || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, institucion: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Teléfono">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.telefono || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, telefono: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>
                    <Field label="Escolaridad">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={detailEq.escolaridad || ""}
                        onChange={(e) => setDetailEq({ ...detailEq, escolaridad: e.target.value })}
                        disabled={!isEditing}
                      />
                    </Field>

                    <div className="md:col-span-2 grid md:grid-cols-2 gap-2">
                      <Info label="Encuesta ID" value={detailEq._encuestaId || "—"} />
                      <Info label="Respuesta ID" value={detailEq._respId || detailEq.id} />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-sm text-gray-700 inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!detailEq.pagado}
                          onChange={(e) => setDetailEq({ ...detailEq, pagado: e.target.checked })}
                          disabled={!isEditing}
                        />
                        Pagado
                      </label>
                    </div>
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
