// src/pages/Concursos.tsx
import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { Link, useNavigate } from "react-router-dom"

/* ---------------- Tipos + Mock (quitar cuando conectes backend) ---------------- */
export type EstadoConcurso = "Activo" | "Próximo" | "Finalizado"

export type Concurso = {
  id: string
  nombre: string
  categoria: string
  sede: string
  fechaInicio: string // ISO
  fechaFin: string    // ISO
  estatus: EstadoConcurso
  participantesActual: number
  participantesMax: number
  portadaUrl?: string
}

const concursosMock: Concurso[] = [
  {
    id: "bd2025",
    nombre: "Concurso de Bases de Datos",
    categoria: "Bases de Datos",
    sede: "Laboratorio de TI",
    fechaInicio: "2025-11-22",
    fechaFin: "2025-11-22",
    estatus: "Activo",
    participantesActual: 18,
    participantesMax: 25,
  },
  {
    id: "prog2025",
    nombre: "Hackathon de Programación",
    categoria: "Programación",
    sede: "Auditorio Principal",
    fechaInicio: "2025-12-05",
    fechaFin: "2025-12-06",
    estatus: "Próximo",
    participantesActual: 9,
    participantesMax: 30,
  },
  {
    id: "robot2025",
    nombre: "Torneo de Robótica",
    categoria: "Robótica",
    sede: "Gimnasio Tech",
    fechaInicio: "2025-10-08",
    fechaFin: "2025-10-09",
    estatus: "Finalizado",
    participantesActual: 28,
    participantesMax: 28,
  },
]
/* ------------------------------------------------------------------------------- */

const TABS: Array<EstadoConcurso | "Todos"> = ["Todos", "Activo", "Próximo", "Finalizado"]

function Chip({
  children,
  tone = "azul",
}: {
  children: React.ReactNode
  tone?: "azul" | "gris" | "verde"
}) {
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
      <p className="mt-1 text-xs text-gray-600">{actual}/{total} participantes</p>
    </div>
  )
}

/* ---------- Menú contextual sencillo (tres puntos) ---------- */
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

/* ------------------------------ Tarjeta ------------------------------ */
function TarjetaConcurso({ c }: { c: Concurso }) {
  const navigate = useNavigate()
  const tone: "azul" | "gris" | "verde" =
    c.estatus === "Activo" ? "azul" : c.estatus === "Próximo" ? "gris" : "verde"

  const irEditar = () => navigate(`/concursos/${c.id}/editar`)
  const irEquipos = () => navigate(`/concursos/${c.id}/equipos`)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="p-4 border-gray-100 hover:border-gray-200 hover:shadow-md transition">
        <div className="flex items-start gap-4">
          {/* Marca/Iniciales */}
          <div className="h-14 w-14 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-bold shrink-0">
            {c.categoria.slice(0, 2).toUpperCase()}
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            {/* Título + estatus + acciones */}
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{c.nombre}</h3>
                  <Chip tone={tone}>{c.estatus}</Chip>
                </div>
                <p className="text-sm text-gray-600 truncate">
                  {c.categoria} · {c.sede}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(c.fechaInicio).toLocaleDateString()} — {new Date(c.fechaFin).toLocaleDateString()}
                </p>
              </div>

              {/* Acciones */}
              <div className="ml-auto flex items-center gap-2">
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

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={irEquipos}>Ver equipos</Button>
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

  const categorias: string[] = useMemo(() => {
    const set = new Set<string>(concursosMock.map((c) => c.categoria))
    return ["Todas", ...Array.from(set)]
  }, [])

  const resultados: Concurso[] = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return concursosMock.filter((c) => {
      const coincideTexto =
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        c.sede.toLowerCase().includes(q) ||
        c.categoria.toLowerCase().includes(q)

      const coincideEstado = tab === "Todos" ? true : c.estatus === tab
      const coincideCategoria = categoria === "Todas" ? true : c.categoria === categoria

      return coincideTexto && coincideEstado && coincideCategoria
    })
  }, [busqueda, tab, categoria])

  return (
    <section className="space-y-5">
      {/* Encabezado */}
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
          {/* Tabs */}
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

          {/* Filtros */}
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

            <Button onClick={() => alert("Nuevo concurso (pendiente)")}>
              Nuevo concurso
            </Button>
          </div>
        </div>
      </Card>

      {/* Resumen */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Resultados: <strong>{resultados.length}</strong></span>
      </div>

      {/* Grid */}
      {resultados.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-600">No se encontraron concursos con esos filtros.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resultados.map((c) => (
            <TarjetaConcurso key={c.id} c={c} />
          ))}
        </div>
      )}
    </section>
  )
}
