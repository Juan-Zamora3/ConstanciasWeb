// src/pages/Asistencias.tsx
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { db } from "../servicios/firebaseConfig"
import {
  collection,
  query,
  where,
  getDocs,
  doc as fsDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from "firebase/firestore"

type EstadoConcurso = "Activo" | "Próximo" | "Finalizado"
type Concurso = {
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

type EquipoUIState = {
  presentes: string[]
  cuotaEquipo: number
  montoEntregado: number
  cambioEntregado: number
  folio: string
  saving?: boolean
  savedOk?: boolean
  error?: string | null
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

/** Normaliza para comparar nombres */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    // @ts-ignore diacríticos
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/** Blacklist de “nombres” inválidos */
const BLACKLIST = new Set([
  "no","n0","na","n a","n/a","ninguno","ninguna","ningunos","ningunas",
  "sin","s/n","sn","null","undefined","-","--","x","xx","0","no aplica","noaplica"
])

/** Valida si parece nombre humano */
const isValidName = (raw: unknown): boolean => {
  if (raw == null) return false
  const original = String(raw).trim()
  if (!original) return false
  const low = normalize(original)
  if (BLACKLIST.has(low)) return false
  if (/@|http|www\./.test(original.toLowerCase())) return false
  if (/[0-9]{2,}/.test(original)) return false
  const letters = original.match(/[a-záéíóúüñç]/gi) || []
  if (letters.length < 2) return false
  if (!/^[\p{L}\s.'-]+$/u.test(original)) return false
  return true
}

/** Title Case correcto (evita GÓMez -> Gómez) */
const tidyName = (raw: string): string => {
  const STOP = new Set([
    "de","del","la","las","los","y","o","u","da","das","do","dos","e","el","en","al"
  ])
  const base = raw.replace(/\s+/g, " ").trim().toLowerCase()
  let titled = base.replace(/(^|\s|[-'’])([\p{L}])/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
  const parts = titled.split(" ")
  for (let i = 1; i < parts.length; i++) {
    const w = parts[i]
    const plain = w.replace(/[-'’]/g, "")
    if (STOP.has(plain.toLowerCase())) parts[i] = w.toLowerCase()
  }
  return parts.join(" ")
}

/** Filtra y limpia integrantes */
const sanitizeIntegrantes = (arr: unknown): string[] => {
  if (!Array.isArray(arr)) return []
  return arr.filter(isValidName).map((x) => tidyName(String(x)))
}

/** Une integrantes con líder (si es válido y no duplicado) */
const mergeWithLeader = (integrantes: string[], lider?: string): string[] => {
  const set = new Set(integrantes.map((n) => normalize(n)))
  const out = [...integrantes]
  if (lider && isValidName(lider)) {
    const clean = tidyName(String(lider))
    if (!set.has(normalize(clean))) out.push(clean)
  }
  return out
}

/* ---------------- Página ---------------- */

export default function Asistencias() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const cursoId = sp.get("concursoId") || ""

  const [curso, setCurso] = useState<Concurso | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [ui, setUi] = useState<Record<string, EquipoUIState>>({})

  // Operación
  const [requierePago, setRequierePago] = useState<boolean>(true)
  const [cajaInicial, setCajaInicial] = useState<number>(0)

  // Filtros / cuota global
  const [filtroCategoria, setFiltroCategoria] = useState<string>("Todas")
  const [buscarEquipo, setBuscarEquipo] = useState<string>("")
  const [cuotaGlobal, setCuotaGlobal] = useState<number>(100)

  /* ----------- 1) Cargar datos del curso ----------- */
  useEffect(() => {
    const load = async () => {
      try {
        if (!cursoId) {
          setError("Falta el parámetro 'concursoId'. Abre esta pantalla desde Concursos.")
          setCargando(false)
          return
        }
        const snap = await getDoc(fsDoc(db, "Cursos", cursoId))
        if (!snap.exists()) {
          setError("No se encontró el curso.")
          setCargando(false)
          return
        }
        const d = snap.data() || {}
        const c: Concurso = {
          id: snap.id,
          nombre: String(d.nombre || d.titulo || "Curso"),
          categoria: String(d.categoria || "General"),
          sede: String(d.sede || "—"),
          fechaInicio: toISO(d.fechaInicio || d.inicio),
          fechaFin: toISO(d.fechaFin || d.fin),
          estatus: "Activo",
          participantesActual: Number(d.participantesActual ?? 0),
          participantesMax: Number(d.participantesMax ?? 30),
          portadaUrl: d.portadaUrl || "",
          instructor: d.instructor || "",
          descripcion: d.descripcion || "",
          tipoCurso: (d.tipoCurso || "grupos") as "personal" | "grupos",
        }
        setCurso(c)
      } catch (e) {
        console.error(e)
        setError("Error al cargar el curso.")
      }
    }
    load()
  }, [cursoId])

  /* ----------- 2) Cargar equipos desde encuestas ----------- */
  useEffect(() => {
    const loadTeams = async () => {
      if (!cursoId) return
      try {
        const qEnc = query(collection(db, "encuestas"), where("cursoId", "==", cursoId))
        const encuestasSnap = await getDocs(qEnc)
        const equiposAcumulados: Equipo[] = []
        for (const encDoc of encuestasSnap.docs) {
          const respRef = collection(fsDoc(db, "encuestas", encDoc.id), "respuestas")
          const respSnap = await getDocs(respRef)
          respSnap.forEach((r) => {
            const data: any = r.data() || {}
            const preset = (data.preset || {}) as any
            const custom = (data.custom || {}) as any
            const nombreEquipo = preset.nombreEquipo || data.nombreEquipo || "Equipo"
            const rawLider = preset.nombreLider || data.nombreLider
            const lider = isValidName(rawLider) ? tidyName(String(rawLider)) : undefined

            const integrantesRaw =
              Array.isArray(preset.integrantes) ? preset.integrantes
              : Array.isArray(data.integrantes) ? data.integrantes
              : []
            const integrantes = sanitizeIntegrantes(integrantesRaw)

            const contactoEquipo = preset.contactoEquipo || data.contactoEquipo
            const categoria = preset.categoria || data.categoria
            const submittedAt =
              data.submittedAt instanceof Timestamp
                ? data.submittedAt.toDate().toISOString()
                : (data.submittedAt ? new Date(String(data.submittedAt)).toISOString() : undefined)

            equiposAcumulados.push({
              id: r.id,
              nombreEquipo,
              nombreLider: lider,
              integrantes,
              contactoEquipo,
              categoria,
              submittedAt,
              maestroAsesor: custom.p1,
              institucion: custom.p2,
              telefono: custom.p3,
              escolaridad: custom.p4,
            })
          })
        }
        equiposAcumulados.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))

        const initialUi: Record<string, EquipoUIState> = {}
        for (const eq of equiposAcumulados) {
          const miembros = mergeWithLeader(eq.integrantes || [], eq.nombreLider)
          initialUi[eq.id] = {
            presentes: miembros,
            cuotaEquipo: 100,
            montoEntregado: 0,
            cambioEntregado: 0,
            folio: "",
            error: null,
          }
        }

        setEquipos(equiposAcumulados)
        setUi(initialUi)
        setCargando(false)
      } catch (e) {
        console.error(e)
        setError("No fue posible cargar los equipos de este curso.")
        setCargando(false)
      }
    }
    loadTeams()
  }, [cursoId])

  /* ----------- 3) Tiempo real sobre asistencias (toda la subcolección) ----------- */
  useEffect(() => {
    if (!cursoId) return
    const col = collection(db, "Cursos", cursoId, "asistencias")
    const unsub = onSnapshot(col, (snap) => {
      setUi((prev) => {
        const next = { ...prev }
        snap.forEach((doc) => {
          const d: any = doc.data() || {}
          // Soporta docs nuevos (id=equipoId) y viejos (id=equipoId_fecha)
          const equipoId = String(d.equipoId || (doc.id || "").split("_")[0] || "")
          if (!equipoId) return
          const st = next[equipoId] || {}
          next[equipoId] = {
            ...st,
            presentes: Array.isArray(d.asistencia?.presentes) ? d.asistencia.presentes : (st.presentes || []),
            cuotaEquipo: Number(d.pago?.cuotaEquipo ?? st.cuotaEquipo ?? 0),
            montoEntregado: Number(d.pago?.montoEntregado ?? st.montoEntregado ?? 0),
            cambioEntregado: Number(d.pago?.cambioEntregado ?? st.cambioEntregado ?? 0),
            folio: d.pago?.folio ?? st.folio ?? "",
            savedOk: true,
          }
        })
        return next
      })
    })
    return () => unsub()
  }, [cursoId])

  /* ----------- Filtros ----------- */

  const categorias = useMemo(() => {
    const set = new Set<string>()
    equipos.forEach((e) => set.add(e.categoria || "General"))
    return ["Todas", ...Array.from(set)]
  }, [equipos])

  const equiposFiltrados = useMemo(() => {
    const q = buscarEquipo.trim().toLowerCase()
    return equipos.filter((eq) => {
      const okCat = filtroCategoria === "Todas" ? true : (eq.categoria || "General") === filtroCategoria
      const texto = [eq.nombreEquipo, eq.nombreLider, eq.institucion].filter(Boolean).join(" ").toLowerCase()
      const okText = q === "" ? true : texto.includes(q)
      return okCat && okText
    })
  }, [equipos, filtroCategoria, buscarEquipo])

  /* ----------- Dinero ----------- */

  const actualizarUI = (id: string, patch: Partial<EquipoUIState>) =>
    setUi((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const toggleIntegrante = (id: string, nombre: string) => {
    const st = ui[id]
    if (!st) return
    const ya = new Set(st.presentes)
    if (ya.has(nombre)) ya.delete(nombre)
    else ya.add(nombre)
    actualizarUI(id, { presentes: Array.from(ya), savedOk: false })
  }

  const seleccionarTodos = (id: string, todos: string[]) => {
    actualizarUI(id, { presentes: [...todos], savedOk: false })
  }
  const deseleccionarTodos = (id: string) => {
    actualizarUI(id, { presentes: [], savedOk: false })
  }

  const esperadoEquipo = (id: string) => {
    if (!requierePago) return 0
    const st = ui[id]
    if (!st) return 0
    const hayAsistencia = (st.presentes?.length || 0) > 0
    return hayAsistencia ? (Number(st.cuotaEquipo) || 0) : 0
  }

  const netoEquipo = (id: string) => {
    const st = ui[id]
    if (!st) return 0
    if (!requierePago) return 0
    return Math.max(0, Number(st.montoEntregado || 0) - Number(st.cambioEntregado || 0))
  }

  const cobradoEquipo = (id: string) => {
    if (!requierePago) return 0
    const esp = esperadoEquipo(id)
    const net = netoEquipo(id)
    return Math.min(net, esp)
  }

  const faltanteEquipo = (id: string) => {
    if (!requierePago) return 0
    const esp = esperadoEquipo(id)
    const cob = cobradoEquipo(id)
    return Math.max(0, esp - cob)
  }

  const resumen = useMemo(() => {
    // Caja: suma de netos (recibido - cambio) de equipos filtrados
    const sumaNeto = equiposFiltrados.reduce((acc, eq) => acc + netoEquipo(eq.id), 0)
    const caja = sumaNeto

    // Total estimado: (equipos filtrados × cuota global) + caja inicial
    const estimacionEquipos = requierePago ? (equiposFiltrados.length * (Number(cuotaGlobal) || 0)) : 0
    const totalEstimado = cajaInicial + estimacionEquipos

    return {
      equipos: equiposFiltrados.length,
      cajaInicial,
      caja,
      totalEstimado,
      cuotaGlobal,
    }
  }, [equiposFiltrados, ui, requierePago, cajaInicial, cuotaGlobal])

  /* ----------- Guardado ----------- */

  const guardarEquipo = async (eq: Equipo) => {
    try {
      actualizarUI(eq.id, { saving: true, error: null })
      const st = ui[eq.id]
      if (!st) return

      const docId = eq.id // ✅ un documento por equipo
      const ref = fsDoc(db, "Cursos", cursoId, "asistencias", docId)

      const miembros = mergeWithLeader(eq.integrantes || [], eq.nombreLider)
      const esperado = esperadoEquipo(eq.id)
      const neto = netoEquipo(eq.id)
      const cobrado = cobradoEquipo(eq.id)
      const faltante = faltanteEquipo(eq.id)
      const pagado = requierePago ? (faltante === 0 && esperado > 0) : true

      const payload = {
        cursoId,
        cursoNombre: curso?.nombre || "",
        equipoId: eq.id,
        nombreEquipo: eq.nombreEquipo,
        updatedAt: serverTimestamp(),

        asistencia: {
          presentes: st.presentes,
          totalPresentes: st.presentes.length,
          integrantesTotales: miembros.length,
        },

        pago: {
          requierePago,
          cuotaEquipo: requierePago ? Number(st.cuotaEquipo || 0) : 0,
          totalEsperado: esperado,
          montoEntregado: requierePago ? Number(st.montoEntregado || 0) : 0,
          cambioEntregado: requierePago ? Number(st.cambioEntregado || 0) : 0,
          netoCobrado: requierePago ? neto : 0,
          aplicadoAEsperado: requierePago ? cobrado : 0,
          faltante,
          metodo: requierePago ? "Efectivo" : "—",
          folio: st.folio || null,
          pagado, // 👈 lo que lee el Cajero
          fechaPago: serverTimestamp(),
        },

        categoria: eq.categoria || null,
        nombreLider: eq.nombreLider || null,
        contactoEquipo: eq.contactoEquipo || null,
        institucion: eq.institucion || null,
      }

      await setDoc(ref, payload, { merge: true })
      actualizarUI(eq.id, { saving: false, savedOk: true })
    } catch (e: any) {
      console.error(e)
      actualizarUI(eq.id, { saving: false, savedOk: false, error: "No se pudo guardar. Revisa consola." })
      alert("No se pudo guardar. Revisa la consola.")
    }
  }

  const guardarMostrados = async () => {
    for (const eq of equiposFiltrados) {
      await guardarEquipo(eq)
    }
    alert("Asistencia/Pagos guardados para los equipos mostrados.")
  }

  /* ----------- Exportar ----------- */

  const exportarExcel = async () => {
    const rows = equiposFiltrados.map((eq) => {
      const st = ui[eq.id]
      const miembros = mergeWithLeader(eq.integrantes || [], eq.nombreLider)
      const esperado = esperadoEquipo(eq.id)
      const neto = netoEquipo(eq.id)
      const faltante = faltanteEquipo(eq.id)
      const pagado = requierePago ? (faltante === 0 && esperado > 0) : true

      return {
        Equipo: eq.nombreEquipo,
        Categoria: eq.categoria || "",
        "Líder": eq.nombreLider || "",
        Institucion: eq.institucion || "",
        "Presentes (#)": st?.presentes.length || 0,
        "Cuota (MXN)": requierePago ? (st?.cuotaEquipo ?? 0) : 0,
        "Recibido (MXN)": requierePago ? (st?.montoEntregado ?? 0) : 0,
        "Cambio (MXN)": requierePago ? (st?.cambioEntregado ?? 0) : 0,
        "Neto (MXN)": requierePago ? neto : 0,
        "Pagado": pagado ? "Sí" : "No",
        "Folio/Nota": st?.folio || "",
      }
    })

    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, "Asistencias")

      XLSX.utils.sheet_add_aoa(ws, [
        [],
        ["Resumen"],
        ["Caja inicial (MXN)", resumen.cajaInicial],
        ["Caja (MXN)", resumen.caja],
        ["Total estimado (MXN)", resumen.totalEstimado],
        ["Equipos (filtrados)", resumen.equipos],
        ["Cuota global (MXN)", resumen.cuotaGlobal],
      ], { origin: -1 })

      const nombreSafe = (curso?.nombre || "curso").replace(/[^\w\-]+/g, "_")
      XLSX.writeFile(wb, `asistencias_${nombreSafe}.xlsx`)
    } catch {
      const headers = Object.keys(rows[0] || { "Sin filas": "" })
      const csv = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => {
          const val = (r as any)[h] ?? ""
          const s = String(val).replace(/"/g, '""')
          return `"${s}"`
        }).join(",")),
        "",
        `"Resumen"`,
        `"Caja inicial (MXN)","${resumen.cajaInicial}"`,
        `"Caja (MXN)","${resumen.caja}"`,
        `"Total estimado (MXN)","${resumen.totalEstimado}"`,
        `"Equipos (filtrados)","${resumen.equipos}"`,
        `"Cuota global (MXN)","${resumen.cuotaGlobal}"`,
      ].join("\n")

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const nombreSafe = (curso?.nombre || "curso").replace(/[^\w\-]+/g, "_")
      a.href = url
      a.download = `asistencias_${nombreSafe}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  /* ----------- Render ----------- */

  if (cargando) return <Card className="p-8 text-sm text-gray-600">Cargando…</Card>
  if (error) return <Card className="p-8 text-sm text-red-600">{error}</Card>
  if (!curso) return <Card className="p-8 text-sm text-red-600">Curso no encontrado.</Card>

  return (
    <section className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asistencia & Caja</h1>
          <p className="text-sm text-gray-600">
            Curso: <span className="font-medium">{curso.nombre}</span> • {curso.sede} • {curso.categoria}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </div>

      {/* Resumen + controles */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* Resumen minimal */}
          <div className="grid gap-2 md:grid-cols-3">
            <ResumePill label="Caja inicial" value={`$${resumen.cajaInicial.toFixed(2)}`} />
            <ResumePill label="Caja" value={`$${resumen.caja.toFixed(2)}`} />
            <ResumePill label="Total estimado" value={`$${resumen.totalEstimado.toFixed(2)}`} />
          </div>

          {/* Controles: pago/caja + filtros + cuota global */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requierePago} onChange={(e)=>setRequierePago(e.target.checked)} />
                Requiere pago
              </label>
              <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm">
                <span className="text-gray-600">Caja inicial (MXN)</span>
                <input
                  type="number"
                  className="w-28 rounded-lg border px-2 py-1"
                  min={0}
                  step="1"
                  value={cajaInicial}
                  onChange={(e)=>setCajaInicial(Number(e.target.value || 0))}
                />
              </div>
              {requierePago && (
                <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm">
                  <span>Cuota global</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    className="w-24 rounded-lg border px-2 py-1"
                    value={cuotaGlobal}
                    onChange={(e)=>setCuotaGlobal(Number(e.target.value || 0))}
                  />
                  <Button size="sm" variant="outline" onClick={()=>{
                    setUi((prev)=>{
                      const next={...prev}
                      for (const id of Object.keys(next)) next[id] = { ...next[id], cuotaEquipo: Number(cuotaGlobal)||0, savedOk:false }
                      return next
                    })
                  }}>Aplicar</Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M21 21l-4.35-4.35m1.35-4.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
                <input
                  value={buscarEquipo}
                  onChange={(e)=>setBuscarEquipo(e.target.value)}
                  placeholder="Buscar equipo, líder o institución…"
                  className="w-64 outline-none text-sm"
                />
              </div>

              <select
                value={filtroCategoria}
                onChange={(e)=>setFiltroCategoria(e.target.value)}
                className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm"
              >
                {categorias.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
              </select>

              <Button variant="outline" onClick={() => { setBuscarEquipo(""); setFiltroCategoria("Todas"); }}>
                Limpiar
              </Button>

              <Button variant="outline" onClick={exportarExcel}>Exportar</Button>
              <Button variant="solid" onClick={guardarMostrados}>Guardar mostrados</Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Lista de equipos */}
      {equiposFiltrados.length === 0 ? (
        <Card className="p-8 text-sm text-gray-600">No hay equipos que cumplan con el filtro.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {equiposFiltrados.map((eq) => {
            const st = ui[eq.id]
            const miembros = mergeWithLeader(eq.integrantes || [], eq.nombreLider)
            const esp = esperadoEquipo(eq.id)
            const cob = cobradoEquipo(eq.id)
            const fal = faltanteEquipo(eq.id)
            const pagado = requierePago ? (fal === 0 && esp > 0) : true

            return (
              <Card key={eq.id} className="p-4 border-gray-100 hover:shadow-lg transition">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-tecnm-azul/10 text-tecnm-azul font-bold">
                    {eq.nombreEquipo?.slice(0,2)?.toUpperCase() || "EQ"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{eq.nombreEquipo}</h3>
                        <p className="text-xs text-gray-600">
                          Líder: {eq.nombreLider || "—"} {eq.institucion ? `• ${eq.institucion}` : ""}
                        </p>
                      </div>
                      {eq.categoria && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 shrink-0">{eq.categoria}</span>
                      )}
                    </div>

                    {/* Asistencia plegable */}
                    <details className="mt-3 rounded-lg border bg-gray-50">
                      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center justify-between">
                        Asistencia <span className="text-xs text-gray-600">({st?.presentes.length || 0}/{miembros.length})</span>
                      </summary>
                      <div className="px-3 pb-3">
                        <div className="flex gap-2 mb-2">
                          <Button size="sm" variant="outline" onClick={() => seleccionarTodos(eq.id, miembros)}>Todos</Button>
                          <Button size="sm" variant="outline" onClick={() => deseleccionarTodos(eq.id)}>Nadie</Button>
                        </div>
                        <ul className="space-y-1 max-h-40 overflow-auto pr-1">
                          {miembros.map((nombre, i) => {
                            const checked = st?.presentes.includes(nombre) || false
                            return (
                              <li key={i} className="flex items-center gap-2">
                                <input
                                  id={`${eq.id}-${i}`}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleIntegrante(eq.id, nombre)}
                                  className="h-4 w-4"
                                />
                                <label htmlFor={`${eq.id}-${i}`} className="text-sm">{nombre}</label>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </details>

                    {/* Pago compacto */}
                    {requierePago ? (
                      <div className="mt-3 rounded-lg border bg-white p-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[11px] text-gray-600">Cuota (MXN)</label>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className="w-full rounded-lg border px-2 py-1"
                              value={st?.cuotaEquipo ?? 0}
                              onChange={(e) => actualizarUI(eq.id, { cuotaEquipo: Number(e.target.value || 0), savedOk: false })}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-600">Recibido (MXN)</label>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className="w-full rounded-lg border px-2 py-1"
                              value={st?.montoEntregado ?? 0}
                              onChange={(e) => actualizarUI(eq.id, { montoEntregado: Number(e.target.value || 0), savedOk: false })}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-600">Cambio (MXN)</label>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className="w-full rounded-lg border px-2 py-1"
                              value={st?.cambioEntregado ?? 0}
                              onChange={(e) => actualizarUI(eq.id, { cambioEntregado: Number(e.target.value || 0), savedOk: false })}
                            />
                          </div>
                        </div>

                        <div className="mt-2 text-sm flex flex-wrap gap-3">
                          <span className={`px-2 py-0.5 rounded ${pagado ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {pagado ? "Pagado" : `Pendiente: $${fal.toFixed(2)}`}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 md:flex md:items-center">
                          <input
                            className="w-full md:w-auto rounded-lg border px-2 py-1 text-sm"
                            value={st?.folio || ""}
                            onChange={(e) => actualizarUI(eq.id, { folio: e.target.value, savedOk: false })}
                            placeholder="Folio/Nota (opcional)"
                          />
                          <Button
                            variant="solid"
                            onClick={() => guardarEquipo(eq)}
                            disabled={st?.saving}
                          >
                            {st?.saving ? "Guardando…" : "Guardar"}
                          </Button>
                          {st?.savedOk && <span className="text-emerald-700 text-sm">✓ Guardado</span>}
                          {st?.error && <span className="text-red-600 text-sm">{st?.error}</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border bg-white p-3 text-sm text-gray-600">
                        Evento sin cobro: solo se registra asistencia.
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="pt-2">
        <Link to={`/concursos`} className="text-sm text-tecnm-azul hover:underline">Volver a Concursos</Link>
      </div>
    </section>
  )
}

/* ---------- Componente de resumen ---------- */
function ResumePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50">
      <div className="text-[11px] uppercase tracking-wide text-gray-700">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  )
}
