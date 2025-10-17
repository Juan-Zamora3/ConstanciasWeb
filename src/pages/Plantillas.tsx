import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"

/* ---------------- Tipos + Mock (quitar cuando conectes backend) ---------------- */
type TipoPlantilla = "Coordinador" | "Asesor" | "Integrante" | "Equipo"

type Plantilla = {
  id: string
  nombre: string
  tipo: TipoPlantilla
  concursoId: string
  actualizadoEn: string // ISO
  contenido?: string    // (placeholder) html/markdown si lo usas después
}

type Concurso = {
  id: string
  nombre: string
}

const concursosMock: Concurso[] = [
  { id: "bd2025", nombre: "Concurso de Bases de Datos" },
  { id: "prog2025", nombre: "Hackathon de Programación" },
  { id: "robot2025", nombre: "Torneo de Robótica" },
]

const plantillasIniciales: Plantilla[] = [
  { id: "p1", nombre: "Coordinador general", tipo: "Coordinador", concursoId: "bd2025", actualizadoEn: "2025-10-02T10:00:00Z" },
  { id: "p2", nombre: "Constancia para Asesor", tipo: "Asesor", concursoId: "prog2025", actualizadoEn: "2025-11-01T12:10:00Z" },
  { id: "p3", nombre: "Integrante estándar", tipo: "Integrante", concursoId: "robot2025", actualizadoEn: "2025-09-18T09:30:00Z" },
  { id: "p4", nombre: "Reconocimiento a Equipo Campeón", tipo: "Equipo", concursoId: "robot2025", actualizadoEn: "2025-09-20T16:20:00Z" },
]
/* ------------------------------------------------------------------------------- */

const TABS: Array<TipoPlantilla | "Todas"> = ["Todas", "Coordinador", "Asesor", "Integrante", "Equipo"]

const varsPorTipo: Record<TipoPlantilla, string[]> = {
  Coordinador: ["{{NOMBRE}}", "{{CARGO}}", "{{CONCURSO}}", "{{FECHA}}"],
  Asesor: ["{{NOMBRE}}", "{{CONCURSO}}", "{{EQUIPO}}", "{{FECHA}}"],
  Integrante: ["{{NOMBRE}}", "{{CONCURSO}}", "{{EQUIPO}}", "{{PUESTO}}", "{{FECHA}}"],
  Equipo: ["{{NOMBRE_EQUIPO}}", "{{CONCURSO}}", "{{CATEGORIA}}", "{{LUGAR}}", "{{FECHA}}"],
}

/* -------------------------- Componentes auxiliares -------------------------- */
function ChipTipo({ tipo }: { tipo: TipoPlantilla }) {
  const map: Record<TipoPlantilla, string> = {
    Coordinador: "bg-gray-100 text-tecnm-azul",
    Asesor: "bg-gray-100 text-gray-700",
    Integrante: "bg-green-100 text-green-700",
    Equipo: "bg-indigo-100 text-indigo-700",
  }
  return <span className={`px-2 py-0.5 text-xs rounded-full ${map[tipo]}`}>{tipo}</span>
}

function NombreConcurso({ id }: { id: string }) {
  const c = concursosMock.find(x => x.id === id)
  return <>{c ? c.nombre : "—"}</>
}

/* ------------------------------ Modal CRUD ------------------------------ */
type FormState = {
  id?: string
  nombre: string
  tipo: TipoPlantilla
  concursoId: string
}

function ModalPlantilla({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean
  initial?: FormState
  onClose: () => void
  onSave: (p: FormState) => void
}) {
  const [form, setForm] = useState<FormState>(
    initial ?? { nombre: "", tipo: "Integrante", concursoId: concursosMock[0]?.id ?? "" }
  )

  // Sincroniza cuando cambia initial (editar)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setForm(initial ?? { nombre: "", tipo: "Integrante", concursoId: concursosMock[0]?.id ?? "" }), [initial])

  const vars = varsPorTipo[form.tipo]

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="dialog"
        className="fixed inset-0 z-50 grid place-items-center px-4"
        initial={{ opacity: 0, y: 12, scale: .98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: .98 }}
      >
        <Card className="w-full max-w-4xl p-4 relative">
          <div className="flex items-start gap-4">
            {/* Formulario */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">{form.id ? "Editar plantilla" : "Nueva plantilla"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Nombre</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej. Reconocimiento de Integrante"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600">Tipo de plantilla</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={form.tipo}
                    onChange={e => setForm({ ...form, tipo: e.target.value as TipoPlantilla })}
                  >
                    {(["Coordinador","Asesor","Integrante","Equipo"] as TipoPlantilla[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Concurso</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={form.concursoId}
                    onChange={e => setForm({ ...form, concursoId: e.target.value })}
                  >
                    {concursosMock.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-600">
                <p className="font-medium">Variables disponibles:</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {vars.map(v => (
                    <code key={v} className="rounded-md bg-gray-100 px-2 py-1">{v}</code>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() => {
                    if (!form.nombre.trim()) return alert("Escribe un nombre para la plantilla.")
                    onSave(form)
                    onClose()
                  }}
                >
                  Guardar
                </Button>
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
              </div>
            </div>

            {/* Preview */}
            <div className="hidden md:block w-80">
              <p className="text-xs text-gray-600 mb-2">Previsualización</p>
              <div className="rounded-2xl border bg-white p-4 shadow-soft">
                <div className="rounded-xl border p-4">
                  <div className="text-center">
                    <p className="text-[11px] text-gray-500">Tecnológico Nacional de México</p>
                    <p className="text-sm font-semibold text-tecnm-azul">Instituto Tecnológico Superior de Puerto Peñasco</p>
                    <p className="mt-2 text-lg font-bold">CONSTANCIA</p>
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-xs text-gray-600">Se otorga a</p>
                    <p className="text-base font-semibold">Juan Pérez (ejemplo)</p>
                    <p className="text-xs text-gray-600 mt-1">
                      por su participación como <strong>{form.tipo}</strong> en el <strong><NombreConcurso id={form.concursoId} /></strong>.
                    </p>
                    <p className="text-[11px] text-gray-500 mt-3">Puerto Peñasco, {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------ Tarjeta ------------------------------ */
function TarjetaPlantilla({
  p,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  p: Plantilla
  onEdit: (p: Plantilla) => void
  onDuplicate: (p: Plantilla) => void
  onDelete: (p: Plantilla) => void
}) {
  const fecha = new Date(p.actualizadoEn).toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-4 hover:shadow-md border border-gray-100 hover:border-gray-200 transition">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="h-12 w-12 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-bold shrink-0">
            {p.tipo.substring(0, 2).toUpperCase()}
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            {/* Fila 1: Título + chip */}
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold truncate">{p.nombre}</h3>
              <ChipTipo tipo={p.tipo} />
            </div>

            {/* Fila 2: concurso + fecha */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-gray-600 truncate">
                <NombreConcurso id={p.concursoId} />
              </p>
              <p className="text-xs text-gray-500 whitespace-nowrap">Actualizado el {fecha}</p>
            </div>

            {/* Fila 3: acciones (siempre abajo) */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(p)}>Editar</Button>
              <Button size="sm" variant="outline" onClick={() => onDuplicate(p)}>Duplicar</Button>
              <Button size="sm" variant="outline" onClick={() => alert("Descargar (pendiente)")}>Descargar</Button>
              <Button size="sm" variant="outline" onClick={() => onDelete(p)}>Eliminar</Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

/* ------------------------------ Página ------------------------------ */
export default function Plantillas() {
  const [busqueda, setBusqueda] = useState("")
  const [tab, setTab] = useState<TipoPlantilla | "Todas">("Todas")
  const [concurso, setConcurso] = useState<string>("Todos")
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Plantilla | undefined>(undefined)
  const [plantillas, setPlantillas] = useState<Plantilla[]>(plantillasIniciales)

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return plantillas.filter(p => {
      const coincideTexto =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        (concursosMock.find(c => c.id === p.concursoId)?.nombre.toLowerCase().includes(q) ?? false)

      const coincideTab = tab === "Todas" ? true : p.tipo === tab
      const coincideConcurso = concurso === "Todos" ? true : p.concursoId === concurso

      return coincideTexto && coincideTab && coincideConcurso
    })
  }, [busqueda, tab, concurso, plantillas])

  const abrirNuevo = () => { setEditando(undefined); setModalOpen(true) }
  const abrirEditar = (p: Plantilla) => { setEditando(p); setModalOpen(true) }

  return (
    <section className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plantillas</h1>
          <p className="text-sm text-gray-600">Diseña y administra plantillas de constancias por concurso y tipo (coordinadores, asesores, integrantes y equipos).</p>
        </div>
        <Button onClick={abrirNuevo}>Nueva plantilla</Button>
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
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar plantilla o concurso…"
                className="w-56 md:w-72 outline-none text-sm"
              />
            </div>

            <select
              value={concurso}
              onChange={e => setConcurso(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="Todos">Todos los concursos</option>
              {concursosMock.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            <Button variant="outline" onClick={() => { setBusqueda(""); setConcurso("Todos"); setTab("Todas") }}>
              Restablecer filtros
            </Button>
          </div>
        </div>
      </Card>

      {/* Resultados */}
      <div className="text-sm text-gray-600">Resultados: <strong>{resultados.length}</strong></div>

      {resultados.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-600">
          No hay plantillas con esos filtros.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resultados.map(p => (
            <TarjetaPlantilla
              key={p.id}
              p={p}
              onEdit={abrirEditar}
              onDuplicate={(pl) => {
                const copia: Plantilla = {
                  ...pl,
                  id: crypto.randomUUID(),
                  nombre: `${pl.nombre} (copia)`,
                  actualizadoEn: new Date().toISOString(),
                }
                setPlantillas(prev => [copia, ...prev])
              }}
              onDelete={(pl) => {
                if (!confirm(`¿Eliminar la plantilla "${pl.nombre}"?`)) return
                setPlantillas(prev => prev.filter(x => x.id !== pl.id))
              }}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <ModalPlantilla
        open={modalOpen}
        initial={editando ? {
          id: editando.id,
          nombre: editando.nombre,
          tipo: editando.tipo,
          concursoId: editando.concursoId
        } : undefined}
        onClose={() => setModalOpen(false)}
        onSave={(f) => {
          if (f.id) {
            // editar
            setPlantillas(prev => prev.map(p => p.id === f.id ? ({
              ...p,
              nombre: f.nombre,
              tipo: f.tipo,
              concursoId: f.concursoId,
              actualizadoEn: new Date().toISOString(),
            }) : p))
          } else {
            // crear
            const nuevo: Plantilla = {
              id: crypto.randomUUID(),
              nombre: f.nombre,
              tipo: f.tipo,
              concursoId: f.concursoId,
              actualizadoEn: new Date().toISOString(),
            }
            setPlantillas(prev => [nuevo, ...prev])
          }
        }}
      />
    </section>
  )
}
