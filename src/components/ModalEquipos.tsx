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
  getDoc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
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

/* ===== Helpers Firestore → opciones ===== */
const toStringArray = (value: any): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === "object") return Object.values(value).map((v) => String(v)).filter(Boolean)
  return []
}

// Busca recursivamente un combobox con ese título
const findComboOptions = (node: any, tituloBuscado: string): string[] => {
  const wanted = tituloBuscado.toLowerCase()
  const visit = (n: any): string[] => {
    if (!n) return []
    if (Array.isArray(n)) {
      for (const el of n) {
        const r = visit(el)
        if (r.length) return r
      }
      return []
    }
    if (typeof n === "object") {
      const tipo = String(n?.tipo || n?.type || "").toLowerCase()
      const titulo = String(n?.titulo || n?.title || "").toLowerCase()
      if (tipo === "combobox" && titulo === wanted) {
        const ops = n?.opciones || n?.options
        return toStringArray(ops)
      }
      for (const k of Object.keys(n)) {
        const r = visit(n[k])
        if (r.length) return r
      }
    }
    return []
  }
  return visit(node)
}

// Junta categorías desde mil formas/rutas posibles
const collectCategoriasFromAny = (src: any): string[] => {
  const set = new Set<string>()
  const push = (v: any) => toStringArray(v).forEach((s) => set.add(String(s).trim()))
  if (!src) return []
  push(src?.categorias)
  push(src?.categoria)
  push(src?.Categorias)
  push(src?.config?.categorias)
  push(src?.Campos?.categorias)
  push(src?.camposPreestablecidos?.categoria?.opciones)
  // combobox “Categoría/Categoria”
  findComboOptions(src, "Categoría").forEach((s) => set.add(s))
  findComboOptions(src, "Categoria").forEach((s) => set.add(s))
  return Array.from(set).filter(Boolean)
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
  const [snapshotEq, setSnapshotEq] = useState<Equipo | null>(null)

  // campos añadir rápido
  const [aNombreEquipo, setANombreEquipo] = useState("")
  const [aNombreLider, setANombreLider] = useState("")
  const [aEmail, setAEmail] = useState("")
  const [aCategoria, setACategoria] = useState("")
  // const [aIntegrantes, setAIntegrantes] = useState("") // ← ya no se usa (dejo comentado por si lo ocupas)
  const [aAsesor, setAAsesor] = useState("")
  const [aInstitucion, setAInstitucion] = useState("")
  const [aTelefono, setATelefono] = useState("")
  const [aEscolaridad, setAEscolaridad] = useState("")
  const [aPagado, setAPagado] = useState(false)

  // 🔢 NUEVO: número de participantes desde Firestore y lista de N comboboxes
  const [cantParticipantes, setCantParticipantes] = useState<number>(1)
  const [aIntegrantesList, setAIntegrantesList] = useState<string[]>([])

  // Mantener el arreglo del tamaño indicado
  useEffect(() => {
    setAIntegrantesList(prev =>
      Array.from({ length: cantParticipantes }, (_, i) => prev[i] ?? "")
    )
  }, [cantParticipantes])

  // Sugerencias para los combobox (a partir de equipos existentes)
  const integrantesSugeridos = useMemo(() => {
    const s = new Set<string>()
    lista.forEach(eq => {
      if (eq.nombreLider) s.add(eq.nombreLider)
      ;(eq.integrantes || []).forEach(n => n && s.add(n))
    })
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"))
  }, [lista])

  // Opciones para los combos
  const [categoriasCurso, setCategoriasCurso] = useState<string[]>([])
  const [escolaridadOpts, setEscolaridadOpts] = useState<string[]>([])

  // Filtro de categorías (combo "Todas las categorías")
  const [filterCat, setFilterCat] = useState<string>("")

  // Categorías para UI = (de Firestore) ∪ (las que ya están en equipos)
  const categoriasUI = useMemo(() => {
    const s = new Set<string>()
    categoriasCurso.forEach((c) => c && s.add(c))
    lista.forEach((e) => e?.categoria && s.add(String(e.categoria)))
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"))
  }, [categoriasCurso, lista])

  useEffect(() => {
    setLista(equiposProp || [])
  }, [equiposProp])

  useEffect(() => {
    (async () => {
      if (!open || !concurso?.id) return

      // 1) Encuestas del curso
      try {
        const qEnc = query(collection(db, "encuestas"), where("cursoId", "==", concurso.id))
        const snap = await getDocs(qEnc)
        const rows = snap.docs.map((d) => ({ id: d.id, titulo: (d.data() as any)?.titulo || d.id }))
        setEncuestas(rows)
        setEncuestaDestino(rows[0]?.id || "")
      } catch (e) {
        console.warn("[ModalEquipos] leer encuestas:", e)
        setEncuestas([])
        setEncuestaDestino("")
      }

      // 2) CATEGORÍAS + ESCOLARIDAD + CANTIDAD PARTICIPANTES
      try {
        const catsSet = new Set<string>()
        let escolCurso: string[] = []
        let cp = 1

        // 2.1 doc del curso
        const cursoSnap = await getDoc(fsDoc(db, "Cursos", concurso.id))
        if (cursoSnap.exists()) {
          const data: any = cursoSnap.data()

          // categorías
          collectCategoriasFromAny(data).forEach((c) => catsSet.add(c))

          // escolaridad (si existiera)
          escolCurso = findComboOptions(
            { preguntasPersonalizadas: data?.preguntasPersonalizadas, campos: data?.campos, preguntas: data?.preguntas, extras: data?.extras, root: data },
            "Escolaridad"
          )
          if (!escolCurso.length) escolCurso = toStringArray(data?.escolaridadOpciones)

          // 🔢 cantidadParticipantes (fallbacks por si cambia la ruta)
          const cpRaw =
            Number(data?.cantidadParticipantes) ||
            Number(data?.formularioGrupos?.cantidadParticipantes) ||
            Number(data?.camposPreestablecidos?.cantidadParticipantes)

          cp = Number.isFinite(cpRaw) && cpRaw > 0 ? Math.min(20, cpRaw) : 1
        }

        // 2.2 subdoc config opcional
        try {
          const confSnap = await getDoc(fsDoc(db, "Cursos", concurso.id, "config", "config"))
          if (confSnap.exists()) collectCategoriasFromAny(confSnap.data()).forEach((c) => catsSet.add(c))
        } catch {}

        // 2.3 subcolección /categorias
        try {
          const catsCol = await getDocs(collection(db, "Cursos", concurso.id, "categorias"))
          catsCol.forEach((d) => {
            const dd: any = d.data() || {}
            const name = dd.nombre || dd.titulo || dd.name || d.id
            if (name) catsSet.add(String(name))
          })
        } catch {}

        // 2.4 recorrer encuestas del curso (por si ahí está el combo)
        try {
          const encSnap = await getDocs(query(collection(db, "encuestas"), where("cursoId", "==", concurso.id)))
          encSnap.forEach((d) => {
            const dd: any = d.data() || {}
            collectCategoriasFromAny(dd).forEach((c) => catsSet.add(c))
          })
        } catch (e) {
          console.warn("[ModalEquipos] categorías desde encuestas:", e)
        }

        const catsFinal = Array.from(catsSet)
          .map((s) => s.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "es"))

        setCategoriasCurso(catsFinal)
        setEscolaridadOpts(escolCurso)

        // defaults seguros
        setACategoria((prev) => (prev && catsFinal.includes(prev) ? prev : catsFinal[0] || ""))
        setAEscolaridad((prev) => (prev && escolCurso.includes(prev) ? prev : escolCurso[0] || ""))

        // cantidad participantes y arreglo de inputs
        setCantParticipantes(cp)
        setAIntegrantesList(Array.from({ length: cp }, () => ""))

      } catch (e) {
        console.warn("[ModalEquipos] opciones curso/encuestas:", e)
        setCategoriasCurso([])
        setEscolaridadOpts([])
        setCantParticipantes(1)
        setAIntegrantesList([""])
      }
    })()
  }, [open, concurso?.id])

  // Si no hay categoría elegida en "añadir" y ya hay categorías, pone la primera
  useEffect(() => {
    if (!aCategoria && categoriasUI.length) setACategoria(categoriasUI[0])
  }, [categoriasUI]) // usamos la unificada

  const filtrados = useMemo(() => {
    const t = busq.trim().toLowerCase()
    return lista.filter((eq) => {
      const matchesText =
        !t ||
        [eq.nombreEquipo, eq.nombreLider, eq.categoria, (eq.integrantes || []).join(" "), eq.institucion]
          .join(" ")
          .toLowerCase()
          .includes(t)
      const matchesCat = !filterCat || eq.categoria === filterCat
      return matchesText && matchesCat
    })
  }, [busq, filterCat, lista])

  const totalParticipantes = useMemo(() => {
  return filtrados.reduce((acc, eq) => {
    const miembros = mergeWithLeaderNames(eq.integrantes || [], eq.nombreLider)
    return acc + miembros.length
  }, 0)
}, [filtrados])


  const togglePagado = async (eq: Equipo, val: boolean) => {
    if (!eq._encuestaId || !eq._respId) return alert("No se puede actualizar este registro.")
    const equipoDocId = eq._respId || eq.id

    try {
      if (val) {
        if (!concurso?.id) return alert("Falta el cursoId para registrar el pago.")
        const miembros = mergeWithLeaderNames(eq.integrantes, eq.nombreLider)

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
              cuotaEquipo: 100,
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
          cuota: 100,
          metodo: "Efectivo",
        })
      } else {
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

      await updateDoc(fsDoc(db, "encuestas", eq._encuestaId, "respuestas", eq._respId), { pagado: val })

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
      setDetailEq(null)
      setIsEditing(false)
    } catch {
      alert("No se pudo eliminar.")
    }
  }

  const guardarEdicion = async () => {
  if (!detailEq || !detailEq._encuestaId || !detailEq._respId) return
  try {
    setSavingEdit(true)

    // ✅ Asegurar que el líder esté en integrantes
    const integrantesFinal = mergeWithLeaderNames(
      Array.isArray(detailEq.integrantes) ? detailEq.integrantes : [],
      detailEq.nombreLider
    )

    const patch: any = {
      preset: {
        nombreEquipo: detailEq.nombreEquipo || "",
        nombreLider: detailEq.nombreLider || "",
        contactoEquipo: detailEq.contactoEquipo || "",
        categoria: detailEq.categoria || "",
        integrantes: integrantesFinal, // 👈 líder incluido
      },
      custom: {
        p1: detailEq.maestroAsesor || "",
        p2: detailEq.institucion || "",
        p3: detailEq.telefono || "",
        p4: detailEq.escolaridad || "",
      },
      pagado: !!detailEq.pagado,
    }

    const encDocRef = fsDoc(db, "encuestas", detailEq._encuestaId, "respuestas", detailEq._respId)
    await updateDoc(encDocRef, patch)

    if (patch.pagado) {
      if (!concurso?.id) {
        alert("Se marcó como pagado, pero falta cursoId para reflejarlo en Asistencias.")
      } else {
        const miembros = integrantesFinal // ya está mergeado
        try {
          await pagarEquipo({
            cursoId: concurso.id,
            cursoNombre: concurso?.nombre || "Curso",
            equipo: {
              id: detailEq._respId,
              nombreEquipo: patch.preset.nombreEquipo,
              integrantes: miembros,
              nombreLider: patch.preset.nombreLider,
              categoria: patch.preset.categoria,
              contactoEquipo: patch.preset.contactoEquipo,
              institucion: patch.custom.p2,
            },
            presentes: miembros,
            cuota: 100,
            metodo: "Efectivo",
          })
        } catch (e) {
          console.error(e)
          await updateDoc(encDocRef, { pagado: false })
          patch.pagado = false
          alert("No se pudo registrar el pago en Asistencias. 'Pagado' fue revertido.")
        }
      }
    } else {
      if (concurso?.id) {
        await setDoc(fsDoc(db, "Cursos", concurso.id, "asistencias", detailEq._respId), { pago: { pagado: false } }, { merge: true })
      }
    }

    // Actualiza estado local con integrantesFinal
    setLista((prev) =>
      prev.map((x) =>
        x._respId === detailEq._respId ? { ...x, ...detailEq, integrantes: integrantesFinal, pagado: patch.pagado } : x
      )
    )
    setIsEditing(false)
    setSnapshotEq({ ...detailEq, integrantes: integrantesFinal, pagado: patch.pagado })
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

    // Integrantes desde los N comboboxes
    const base = aIntegrantesList.map(s => s.trim()).filter(Boolean)
    // ✅ Incluye al líder (sin duplicar)
    const integrantes = mergeWithLeaderNames(base, aNombreLider)

    const payload = {
      createdAt: serverTimestamp(),
      submittedAt: serverTimestamp(),
      pagado: aPagado,
      preset: {
        nombreEquipo: aNombreEquipo.trim() || "Equipo",
        nombreLider: aNombreLider.trim() || "",
        contactoEquipo: aEmail.trim() || "",
        categoria: aCategoria.trim() || "",
        integrantes, // 👈 ya trae al líder adentro
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
      integrantes, // 👈 líder incluido
      contactoEquipo: payload.preset.contactoEquipo,
      categoria: payload.preset.categoria,
      submittedAt: new Date().toISOString(),
      maestroAsesor: payload.custom.p1,
      institucion: payload.custom.p2,
      telefono: payload.custom.p3,
      escolaridad: payload.custom.p4,
    }
    setLista((prev) => [nuevo, ...prev])

    if (aPagado) {
      if (!concurso?.id) {
        alert("Se marcó como pagado, pero no tengo cursoId para reflejarlo en Asistencias.")
      } else {
        // Ya incluye al líder; de todos modos mergea por seguridad
        const miembros = mergeWithLeaderNames(integrantes, aNombreLider)
        await pagarEquipo({
          cursoId: concurso.id,
          cursoNombre: concurso?.nombre || "Curso",
          equipo: {
            id: refDoc.id,
            nombreEquipo: payload.preset.nombreEquipo,
            integrantes: miembros,
            nombreLider: payload.preset.nombreLider,
            categoria: payload.preset.categoria,
            contactoEquipo: payload.preset.contactoEquipo,
            institucion: payload.custom.p2,
          },
          presentes: miembros,
          cuota: 100,
          metodo: "Efectivo",
        }).catch(async (e) => {
          console.error(e)
          await updateDoc(fsDoc(db, "encuestas", encuestaDestino, "respuestas", refDoc.id), { pagado: false })
          setLista((prev) => prev.map((x) => (x._respId === refDoc.id ? { ...x, pagado: false } : x)))
          alert("El equipo se añadió, pero no se pudo registrar el pago en Asistencias. Quedó como Pendiente.")
        })
      }
    }

    // Reset
    setANombreEquipo("")
    setANombreLider("")
    setAEmail("")
    setACategoria("")
    setAAsesor("")
    setAInstitucion("")
    setATelefono("")
    setAEscolaridad("")
    setAPagado(false)
    setAIntegrantesList(Array.from({ length: cantParticipantes }, () => ""))
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
        if (detailEq) {
          setDetailEq(null)
          setIsEditing(false)
          return
        }
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
            {/* Barra superior */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div
                className={`${pill} flex items-center gap-2 bg-white px-3 py-2 shadow-inner w-full md:w-auto ring-1 ring-gray-200
                                focus-within:ring-tecnm-azul/35`}
              >
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

              {/* Combo: Todas las categorías */}
              <select
                className={`${pill} px-3 py-2 text-sm ring-1 ring-gray-200 bg-white`}
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
              >
                <option value="">Todas las categorías</option>
                {categoriasUI.map((c, i) => (
                  <option key={`${c}__${i}`} value={c}>{c}</option>
                ))}
              </select>

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
                        ? <option key="ph" value="">(No hay encuestas para este curso)</option>
                        : encuestas.map((e, i) => <option key={`${e.id}__${i}`} value={e.id}>{e.titulo || e.id}</option>)
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
                    <select
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      value={aCategoria}
                      onChange={(e) => setACategoria(e.target.value)}
                    >
                      <option key="ph" value="">{categoriasUI.length ? "Selecciona…" : "(sin categorías definidas)"}</option>
                      {categoriasUI.map((c, i) => (
                        <option key={`${c}__${i}`} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Integrantes N comboboxes */}
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-600">
                      Integrantes ({cantParticipantes})
                    </label>

                    <div className="mt-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Array.from({ length: cantParticipantes }).map((_, i) => (
                        <input
                          key={`int-${i}`}
                          list="lista-integrantes"
                          value={aIntegrantesList[i] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value
                            setAIntegrantesList(prev => {
                              const arr = [...prev]
                              arr[i] = v
                              return arr
                            })
                          }}
                          placeholder={`Integrante ${i + 1}`}
                          className="w-full rounded-xl border px-3 py-2 text-sm"
                        />
                      ))}
                    </div>

                    {/* Sugerencias para el combobox */}
                    <datalist id="lista-integrantes">
                      {integrantesSugeridos.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
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
                  const integrantesCount = mergeWithLeaderNames(eq.integrantes || [], eq.nombreLider).length

                  return (
                    <Card
                      key={eq.id}
                      className="relative p-4 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow-lg hover:ring-tecnm-azul/30 transition cursor-pointer"
                      onClick={() => { setDetailEq(eq); setSnapshotEq(eq); setIsEditing(false) }}
                    >
                      {/* chip pagado */}
                      <label
                        className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium
                                    border ring-1 shadow-sm
                                    ${eq.pagado
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200"
                                      : "bg-white/95 text-slate-700 border-slate-200 ring-slate-200"}`}
                        title="Marcar como pagado"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input type="checkbox" className="h-4 w-4" checked={!!eq.pagado} onChange={(e) => togglePagado(eq, e.target.checked)} />
                        <span>{eq.pagado ? "Pagado" : "Pendiente"}</span>
                      </label>

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
                          {eq.contactoEquipo && (<p className="text-xs text-gray-500 truncate">{eq.contactoEquipo}</p>)}
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

        {/* Modal DETALLES */}
        <AnimatePresence>
          {detailEq && (
            <>
              <motion.div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => { setDetailEq(null); setIsEditing(false) }}
              />
              <motion.div
                className="fixed inset-0 grid place-items-center p-4"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
              >
                <Card className="w-full max-w-2xl p-4 rounded-2xl ring-1 ring-slate-200 shadow-xl bg-white/95 backdrop-blur" onClick={(e)=>e.stopPropagation()}>
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSnapshotEq(detailEq); setIsEditing(true) }}
                          >
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

                  <div className="grid md:grid-cols-2 gap-2 mt-3">
                    <Field label="Nombre del equipo">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.nombreEquipo || ""} onChange={(e) => setDetailEq({ ...detailEq, nombreEquipo: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Nombre del líder">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.nombreLider || ""} onChange={(e) => setDetailEq({ ...detailEq, nombreLider: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Correo del equipo">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.contactoEquipo || ""} onChange={(e) => setDetailEq({ ...detailEq, contactoEquipo: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Categoría">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.categoria || ""} onChange={(e) => setDetailEq({ ...detailEq, categoria: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Integrantes (coma)">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={(detailEq.integrantes || []).join(", ")} onChange={(e) => setDetailEq({ ...detailEq, integrantes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} disabled={!isEditing} />
                    </Field>
                    <Field label="Maestro asesor">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.maestroAsesor || ""} onChange={(e) => setDetailEq({ ...detailEq, maestroAsesor: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Institución">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.institucion || ""} onChange={(e) => setDetailEq({ ...detailEq, institucion: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Teléfono">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.telefono || ""} onChange={(e) => setDetailEq({ ...detailEq, telefono: e.target.value })} disabled={!isEditing} />
                    </Field>
                    <Field label="Escolaridad">
                      <input className="w-full rounded-xl border px-3 py-2 text-sm" value={detailEq.escolaridad || ""} onChange={(e) => setDetailEq({ ...detailEq, escolaridad: e.target.value })} disabled={!isEditing} />
                    </Field>

                    <div className="md:col-span-2 grid md:grid-cols-2 gap-2">
                      <Info label="Encuesta ID" value={detailEq._encuestaId || "—"} />
                      <Info label="Respuesta ID" value={detailEq._respId || detailEq.id} />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-sm text-gray-700 inline-flex items-center gap-2">
                        <input type="checkbox" checked={!!detailEq.pagado} onChange={(e) => setDetailEq({ ...detailEq, pagado: e.target.checked })} disabled={!isEditing} />
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
