import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"

/* ===== Helpers y Tipos ===== */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const nombreConcurso = (id: string, lista: Concurso[]) => lista.find((c) => c.id === id)?.nombre ?? "—"

type TipoPlantilla = "Coordinador" | "Asesor" | "Integrante" | "Equipo"
type Concurso = { id: string; nombre: string }
type Plantilla = { id: string; nombre: string; tipo: TipoPlantilla; concursoId: string }

type Destinatario = {
  id: string
  nombre: string
  equipo?: string
  puesto?: string
  lugar?: string
  email?: string
}

type Emision = {
  id: string
  plantillaId: string
  plantillaNombre: string
  tipo: TipoPlantilla
  concursoId: string
  total: number
  fecha: string // ISO
  estado: "Emitidas"
}

type EstadoCorreo = "en-cola" | "enviado" | "error"
type LogCorreo = {
  id: string
  timestamp: string
  destinatario: string
  email?: string
  plantillaNombre: string
  concursoId: string
  estado: EstadoCorreo
  errorMsg?: string
}

const chipCorreo: Record<EstadoCorreo, string> = {
  "en-cola": "bg-amber-100 text-amber-700",
  enviado: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
}

/* ===== Mock data ===== */
const concursosMock: Concurso[] = [
  { id: "bd2025", nombre: "Concurso de Bases de Datos" },
  { id: "prog2025", nombre: "Hackathon de Programación" },
  { id: "robot2025", nombre: "Torneo de Robótica" },
]

const plantillasMock: Plantilla[] = [
  { id: "p1", nombre: "Coordinador general", tipo: "Coordinador", concursoId: "bd2025" },
  { id: "p2", nombre: "Constancia Asesor", tipo: "Asesor", concursoId: "prog2025" },
  { id: "p3", nombre: "Integrante estándar", tipo: "Integrante", concursoId: "robot2025" },
  { id: "p4", nombre: "Equipo Campeón", tipo: "Equipo", concursoId: "robot2025" },
]

const varsPorTipo: Record<TipoPlantilla, string[]> = {
  Coordinador: ["{{NOMBRE}}", "{{CARGO}}", "{{CONCURSO}}", "{{FECHA}}"],
  Asesor: ["{{NOMBRE}}", "{{CONCURSO}}", "{{EQUIPO}}", "{{FECHA}}"],
  Integrante: ["{{NOMBRE}}", "{{CONCURSO}}", "{{EQUIPO}}", "{{PUESTO}}", "{{FECHA}}"],
  Equipo: ["{{NOMBRE_EQUIPO}}", "{{CONCURSO}}", "{{CATEGORIA}}", "{{LUGAR}}", "{{FECHA}}"],
}

/* ===== Página ===== */
export default function Constancias() {
  // Filtros
  const [concursoId, setConcursoId] = useState<string>("Todos")
  const [tipo, setTipo] = useState<TipoPlantilla | "Todos">("Todos")

  // Plantillas filtradas y selección
  const plantillasFiltradas = useMemo(() => {
    return plantillasMock.filter(
      (p) => (concursoId === "Todos" || p.concursoId === concursoId) && (tipo === "Todos" || p.tipo === tipo)
    )
  }, [concursoId, tipo])

  const [plantillaId, setPlantillaId] = useState<string>(plantillasFiltradas[0]?.id ?? "")
  const plantilla = plantillasMock.find((p) => p.id === plantillaId)
  const plantillaTipo: TipoPlantilla | undefined = plantilla?.tipo

  // Columnas extra según tipo
  const columnasExtra: string[] = useMemo(() => {
    switch (plantillaTipo) {
      case "Equipo":
        return ["lugar"]
      case "Integrante":
      case "Asesor":
        return ["equipo", "puesto"]
      case "Coordinador":
        return ["puesto"]
      default:
        return []
    }
  }, [plantillaTipo])

  // Destinatarios
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([{ id: uid(), nombre: "", email: "" }])

  const agregarFila = () => setDestinatarios((prev) => [...prev, { id: uid(), nombre: "", email: "" }])
  const actualizar = (id: string, campo: keyof Destinatario, valor: string) =>
    setDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)))
  const eliminarFila = (id: string) => setDestinatarios((prev) => prev.filter((d) => d.id !== id))
  const limpiarFormulario = () => setDestinatarios([{ id: uid(), nombre: "", email: "" }])

  // Emisiones (mock) + Logs de correo
  const [emisiones, setEmisiones] = useState<Emision[]>([])
  const [correoLogs, setCorreoLogs] = useState<LogCorreo[]>([])

  const emitir = () => {
    if (!plantilla) return alert("Selecciona una plantilla.")
    if (destinatarios.some((d) => !d.nombre.trim())) return alert("Completa el nombre de todos los destinatarios.")

    // 1) Registrar emisión (resumen)
    const nueva: Emision = {
      id: uid(),
      plantillaId: plantilla.id,
      plantillaNombre: plantilla.nombre,
      tipo: plantilla.tipo,
      concursoId: plantilla.concursoId,
      total: destinatarios.length,
      fecha: new Date().toISOString(),
      estado: "Emitidas",
    }
    setEmisiones((prev) => [nueva, ...prev])

    // 2) Registrar logs "en-cola"
    const ahora = new Date().toISOString()
    const nuevosLogs: LogCorreo[] = destinatarios.map((d) => ({
      id: uid(),
      timestamp: ahora,
      destinatario: d.nombre,
      email: d.email,
      plantillaNombre: plantilla.nombre,
      concursoId: plantilla.concursoId,
      estado: "en-cola",
    }))
    setCorreoLogs((prev) => [...nuevosLogs, ...prev])

    // 3) Simular envío (a los 1.2s cambia estado aleatoriamente)
    setTimeout(() => {
      setCorreoLogs((prev) =>
        prev.map((log) =>
          nuevosLogs.some((n) => n.id === log.id)
            ? {
                ...log,
                estado: Math.random() < 0.95 ? "enviado" : "error",
                errorMsg: Math.random() < 0.95 ? undefined : "SMTP rechazó el destinatario",
              }
            : log
        )
      )
    }, 1200)

    alert(`Se emitieron ${destinatarios.length} constancias y se inició el envío por correo (simulado).`)
    limpiarFormulario()
  }

  return (
    <section className="space-y-5">
      {/* Título */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Constancias</h1>
          <p className="text-sm text-gray-600">Emite constancias por concurso, tipo y plantilla.</p>
        </div>
      </div>

      {/* Filtros + plantilla */}
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-gray-600">Concurso</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={concursoId}
              onChange={(e) => setConcursoId(e.target.value)}
            >
              <option value="Todos">Todos</option>
              {concursosMock.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600">Tipo</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoPlantilla | "Todos")}
            >
              <option value="Todos">Todos</option>
              {(["Coordinador","Asesor","Integrante","Equipo"] as TipoPlantilla[]).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Plantilla</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
            >
              {plantillasFiltradas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {nombreConcurso(p.concursoId, concursosMock)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Variables: {plantillaTipo ? varsPorTipo[plantillaTipo].join(", ") : "—"}
            </p>
          </div>
        </div>
      </Card>

      {/* Destinatarios */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Destinatarios</h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={agregarFila}>Agregar fila</Button>
            <Button variant="outline" onClick={() => alert("Importar CSV (pendiente)")}>Importar CSV</Button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Email</th>
                {columnasExtra.includes("equipo") && <th className="py-2 pr-3">Equipo</th>}
                {columnasExtra.includes("puesto") && (
                  <th className="py-2 pr-3">{plantillaTipo === "Coordinador" ? "Cargo" : "Puesto"}</th>
                )}
                {columnasExtra.includes("lugar") && <th className="py-2 pr-3">Lugar</th>}
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {destinatarios.map((d, i) => (
                <tr key={d.id} className="border-t">
                  <td className="py-2 pr-3">
                    <input
                      className="w-64 rounded-xl border border-gray-300 px-3 py-2"
                      placeholder={`Nombre #${i + 1}`}
                      value={d.nombre}
                      onChange={(e) => actualizar(d.id, "nombre", e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-64 rounded-xl border border-gray-300 px-3 py-2"
                      placeholder="correo@ejemplo.com"
                      value={d.email ?? ""}
                      onChange={(e) => actualizar(d.id, "email", e.target.value)}
                    />
                  </td>

                  {columnasExtra.includes("equipo") && (
                    <td className="py-2 pr-3">
                      <input
                        className="w-48 rounded-xl border border-gray-300 px-3 py-2"
                        placeholder="Equipo"
                        value={d.equipo ?? ""}
                        onChange={(e) => actualizar(d.id, "equipo", e.target.value)}
                      />
                    </td>
                  )}

                  {columnasExtra.includes("puesto") && (
                    <td className="py-2 pr-3">
                      <input
                        className="w-48 rounded-xl border border-gray-300 px-3 py-2"
                        placeholder={plantillaTipo === "Coordinador" ? "Cargo" : "Puesto"}
                        value={d.puesto ?? ""}
                        onChange={(e) => actualizar(d.id, "puesto", e.target.value)}
                      />
                    </td>
                  )}

                  {columnasExtra.includes("lugar") && (
                    <td className="py-2 pr-3">
                      <input
                        className="w-40 rounded-xl border border-gray-300 px-3 py-2"
                        placeholder="Lugar"
                        value={d.lugar ?? ""}
                        onChange={(e) => actualizar(d.id, "lugar", e.target.value)}
                      />
                    </td>
                  )}

                  <td className="py-2">
                    <Button variant="outline" size="sm" onClick={() => eliminarFila(d.id)}>Eliminar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => alert("Previsualizar (pendiente)")}>Previsualizar</Button>
          <Button onClick={emitir}>Emitir constancias</Button>
        </div>
      </Card>

      {/* Historial */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Historial</h3>
        {emisiones.length === 0 ? (
          <Card className="p-6 text-sm text-gray-600">Aún no hay emisiones registradas.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {emisiones.map((e) => (
              <motion.div key={e.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-4 border border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{e.plantillaNombre}</p>
                      <p className="text-sm text-gray-600">{e.tipo} · {nombreConcurso(e.concursoId, concursosMock)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(e.fecha).toLocaleString("es-MX")} · {e.total} constancias
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Emitidas</span>
                      <Button size="sm" variant="outline" onClick={() => alert("Descargar ZIP (pendiente)")}>
                        Descargar ZIP
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Envíos de correo */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Envíos de correo</h3>
        {correoLogs.length === 0 ? (
          <Card className="p-6 text-sm text-gray-600">Aún no hay correos enviados.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {correoLogs.map((log) => (
              <motion.div key={log.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-4 border border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{log.destinatario}</p>
                      <p className="text-sm text-gray-600 truncate">
                        {log.plantillaNombre} · {nombreConcurso(log.concursoId, concursosMock)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(log.timestamp).toLocaleString("es-MX")}</p>
                      {log.estado === "error" && (
                        <p className="text-xs text-red-600 mt-1">Error: {log.errorMsg ?? "desconocido"}</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${chipCorreo[log.estado]}`}>
                      {log.estado === "en-cola" ? "En cola" : log.estado === "enviado" ? "Enviado" : "Error"}
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
