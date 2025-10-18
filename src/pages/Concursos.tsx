import React, { useEffect, useMemo, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "../components/ui/Card"
import Button from "../components/ui/Button"
import { Link, useNavigate } from "react-router-dom"

// ⬇️ IMPORTA db DESDE TU CONFIG DE FIREBASE
import { db } from "../servicios/firebaseConfig.ts"


// Firebase Firestore
import {
  Timestamp,
  collection,
  collectionGroup,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore"
import type { DocumentData } from "firebase/firestore"
/* ---------------- Tipos ---------------- */
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

type Equipo = {
  id: string
  nombre: string
  categoria?: string
  lider?: string
  contacto?: string
  telefono?: string
  institucion?: string
  escolaridad?: string
  asesor?: string
  integrantes: string[]
  registradoEn?: string
  datosCrudos: DocumentData
}

type EstadoEquipos = {
  equipos: Equipo[]
  cargando: boolean
  error: string | null
  ultimaLectura?: string
}

/* ---------------- Utilidades ---------------- */
const toISO = (v: unknown): string => {
  // Soporta Timestamp de Firestore, Date o string.
  try {
    if (!v) return ""
    if (v instanceof Timestamp) return v.toDate().toISOString().slice(0, 10)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    const s = String(v)
    // si ya viene como "YYYY-MM-DD" o ISO, lo regresamos tal cual (solo fecha)
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
  // Heurística: si la fecha fin ya pasó → Finalizado; si la inicio es futura → Próximo; si no → Activo
  return "Activo"
}

const normaliza = (valor: unknown): string => {
  if (valor == null) return ""
  if (valor instanceof Timestamp) return valor.toDate().toISOString()
  if (valor instanceof Date) return valor.toISOString()
  if (Array.isArray(valor)) return valor.map((v) => normaliza(v)).join(" ")
  return String(valor)
}

const normalizaClave = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

const extraeLista = (valor: unknown): string[] => {
  if (!valor) return []
  if (Array.isArray(valor)) {
    return valor
      .map((item) => normaliza(item).trim())
      .filter((item) => item.length > 0)
  }
  const texto = normaliza(valor)
  if (!texto) return []
  return texto
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

const formateaFecha = (valor?: string): string => {
  if (!valor) return ""
  try {
    const fecha = new Date(valor)
    if (isNaN(fecha.getTime())) return ""
    return `${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  } catch (e) {
    console.warn("No se pudo formatear la fecha", e)
  }
  return ""
}

const determinarCoincidencia = (texto: string, concurso: Concurso): boolean => {
  const base = normaliza(texto).toLowerCase()
  if (!base) return false
  const candidatos = [concurso.id, concurso.nombre, concurso.categoria]
  return candidatos.some((c) => c && base.includes(String(c).toLowerCase()))
}

const extraerCampo = (datos: DocumentData, claves: string[][], fallback?: string): string | undefined => {
  const entradas = Object.entries(datos)
  for (const [clave, valor] of entradas) {
    const claveNorm = normalizaClave(clave)
    for (const grupo of claves) {
      if (grupo.every((fragmento) => claveNorm.includes(fragmento))) {
        const normalizado = normaliza(valor).trim()
        if (normalizado) return normalizado
      }
    }
  }
  return fallback
}

const extraerIntegrantes = (datos: DocumentData): string[] => {
  const integrantes = new Set<string>()
  if (datos.integrantes) {
    extraeLista(datos.integrantes).forEach((item) => integrantes.add(item))
  }

  for (const [clave, valor] of Object.entries(datos)) {
    const claveNorm = normalizaClave(clave)
    if (/(integrante|miembro|participante)/.test(claveNorm)) {
      extraeLista(valor).forEach((item) => integrantes.add(item))
    }
  }

  return Array.from(integrantes)
}

const parseaEquipo = (docId: string, datos: DocumentData): Equipo => {
  const nombre =
    normaliza(
      datos.nombreEquipo ??
        datos.nombre ??
        datos.equipo ??
        extraerCampo(datos, [["nombre", "equipo"], ["nombre", "proyecto"], ["equipo"]], "")
    ).trim() || `Equipo ${docId}`

  const categoria =
    datos.categoria ??
    datos.categoriaEquipo ??
    extraerCampo(datos, [["categoria"], ["nivel", "categoria"], ["categoria", "concurso"]])

  const lider =
    datos.lider ??
    datos.liderNombre ??
    extraerCampo(datos, [["lider"], ["representante"], ["capitan"]])

  const contacto =
    datos.contacto ??
    datos.email ??
    datos.correo ??
    extraerCampo(datos, [["correo"], ["email"], ["contacto"]])

  const telefono =
    datos.telefono ??
    datos.telefonoLider ??
    datos.celular ??
    extraerCampo(datos, [["telefono"], ["celular"], ["contacto", "telefono"]])

  const institucion =
    datos.institucion ??
    datos.escuela ??
    datos.centro ??
    extraerCampo(datos, [["institucion"], ["escuela"], ["plantel"]])

  const escolaridad =
    datos.escolaridad ??
    datos.nivel ??
    extraerCampo(datos, [["escolaridad"], ["nivel", "academico"], ["grado"]])

  const asesor =
    datos.asesor ??
    datos.mentor ??
    extraerCampo(datos, [["asesor"], ["mentor"], ["docente"], ["profesor"]])

  const fechaRegistro = (() => {
    if (datos.fechaRegistro) return normaliza(datos.fechaRegistro)
    if (datos.createdAt) return normaliza(datos.createdAt)
    if (datos.timestamp) return normaliza(datos.timestamp)
    const posible = extraerCampo(datos, [["fecha"], ["registr"], ["enviado"]])
    return posible
  })()

  return {
    id: docId,
    nombre,
    categoria: categoria ? normaliza(categoria) : undefined,
    lider: lider ? normaliza(lider) : undefined,
    contacto: contacto ? normaliza(contacto) : undefined,
    telefono: telefono ? normaliza(telefono) : undefined,
    institucion: institucion ? normaliza(institucion) : undefined,
    escolaridad: escolaridad ? normaliza(escolaridad) : undefined,
    asesor: asesor ? normaliza(asesor) : undefined,
    integrantes: extraerIntegrantes(datos),
    registradoEn: fechaRegistro ? normaliza(fechaRegistro) : undefined,
    datosCrudos: datos,
  }
}

const generaCandidatosEncuesta = (concurso: Concurso): string[] => {
  const limpiar = (s: string) =>
    normaliza(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

  const candidatos = new Set<string>()
  candidatos.add(concurso.id)
  candidatos.add(limpiar(concurso.id))
  if (concurso.nombre) {
    candidatos.add(concurso.nombre)
    candidatos.add(limpiar(concurso.nombre))
  }
  if (concurso.categoria) {
    candidatos.add(concurso.categoria)
    candidatos.add(limpiar(concurso.categoria))
  }
  return Array.from(candidatos).filter((item) => item.trim().length > 0)
}

const obtenerEquiposDeEncuesta = async (concurso: Concurso): Promise<Equipo[]> => {
  const candidatos = generaCandidatosEncuesta(concurso)
  for (const candidato of candidatos) {
    try {
      const col = collection(db, "encueestas", candidato, "respuestas")
      const snap = await getDocs(col)
      if (!snap.empty) {
        return snap.docs.map((doc) => parseaEquipo(doc.id, doc.data() || {}))
      }
    } catch (error) {
      console.warn(`No se pudo leer encueestas/${candidato}/respuestas`, error)
    }
  }

  try {
    const raiz = await getDocs(collection(db, "encueestas"))
    for (const encuesta of raiz.docs) {
      try {
        const datosEncuesta = encuesta.data() || {}
        if (
          encuesta.id === "respuestas" ||
          determinarCoincidencia(JSON.stringify(datosEncuesta), concurso)
        ) {
          const col = collection(encuesta.ref, "respuestas")
          const snap = await getDocs(col)
          if (!snap.empty) {
            return snap.docs.map((doc) => parseaEquipo(doc.id, doc.data() || {}))
          }
        }
      } catch (error) {
        console.warn(`No se pudo inspeccionar encuesta ${encuesta.id}`, error)
      }
    }
  } catch (error) {
    console.warn("No se pudo listar la colección encueestas", error)
  }

  try {
    const grupo = await getDocs(collectionGroup(db, "respuestas"))
    const coincidencias = grupo.docs
      .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
      .filter(({ data }) => determinarCoincidencia(JSON.stringify(data), concurso))
      .map(({ id, data }) => parseaEquipo(id, data))
    if (coincidencias.length > 0) {
      return coincidencias
    }
  } catch (error) {
    console.warn("No se pudo consultar collectionGroup(respuestas)", error)
  }

  return []
}

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
function TarjetaConcurso({
  c,
  seleccionado,
  onSeleccionar,
  estadoEquipos,
  onRefrescar,
}: {
  c: Concurso
  seleccionado: boolean
  onSeleccionar: (concurso: Concurso) => void
  estadoEquipos?: EstadoEquipos
  onRefrescar: (concurso: Concurso) => void
}) {
  const navigate = useNavigate()
  const tone: "azul" | "gris" | "verde" =
    c.estatus === "Activo" ? "azul" : c.estatus === "Próximo" ? "gris" : "verde"

  const irEditar = () => navigate(`/concursos/${c.id}/editar`)
  const irEquipos = () => navigate(`/concursos/${c.id}/equipos`)

  const [tabDetalle, setTabDetalle] = useState<"info" | "equipos">("equipos")
  const [equipoActivo, setEquipoActivo] = useState<Equipo | null>(null)

  useEffect(() => {
    if (!seleccionado) {
      setEquipoActivo(null)
      setTabDetalle("equipos")
    }
  }, [seleccionado])

  const abrirEquipo = (equipo: Equipo) => setEquipoActivo(equipo)
  const cerrarEquipo = () => setEquipoActivo(null)

  const resumenEquipos = estadoEquipos?.equipos || []
  const cargandoEquipos = estadoEquipos?.cargando
  const errorEquipos = estadoEquipos?.error
  const refrescarEquipos = () => onRefrescar(c)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card
        className={`p-4 border-gray-100 transition ${
          seleccionado
            ? "border-tecnm-azul/40 shadow-lg"
            : "hover:border-gray-200 hover:shadow-md"
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Marca/Iniciales */}
          <div className="h-14 w-14 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-bold shrink-0">
            {c.categoria?.slice(0, 2)?.toUpperCase() || "CO"}
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            {/* Título + estatus + acciones */}
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSeleccionar(c)}
                    className="text-left font-semibold text-gray-900 transition hover:text-tecnm-azul focus:outline-none"
                  >
                    {c.nombre || "Concurso"}
                  </button>
                  <Chip tone={tone}>{c.estatus}</Chip>
                </div>
                <p className="text-sm text-gray-600 truncate">
                  {c.categoria || "Categoría"} · {c.sede || "Sede"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString() : "—"} — {c.fechaFin ? new Date(c.fechaFin).toLocaleDateString() : "—"}
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
              <Button
                size="sm"
                variant={seleccionado ? "solid" : "outline"}
                onClick={() => onSeleccionar(c)}
              >
                {seleccionado ? "Ocultar detalle" : "Ver detalle"}
              </Button>
            </div>
          </div>
        </div>

        {seleccionado && (
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTabDetalle("info")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  tabDetalle === "info"
                    ? "border-tecnm-azul bg-tecnm-azul text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Información del concurso
              </button>
              <button
                type="button"
                onClick={() => setTabDetalle("equipos")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  tabDetalle === "equipos"
                    ? "border-tecnm-azul bg-tecnm-azul text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Equipos registrados
              </button>
            </div>

            {tabDetalle === "info" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Nombre</p>
                  <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Categoría</p>
                  <p className="text-sm font-medium text-gray-900">{c.categoria || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sede</p>
                  <p className="text-sm font-medium text-gray-900">{c.sede || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fechas</p>
                  <p className="text-sm font-medium text-gray-900">
                    {c.fechaInicio ? new Date(c.fechaInicio).toLocaleDateString() : "—"} · {c.fechaFin ? new Date(c.fechaFin).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Participantes</p>
                  <p className="text-sm font-medium text-gray-900">
                    {c.participantesActual} / {c.participantesMax}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                  <span>
                    <strong>{resumenEquipos.length}</strong> equipos registrados
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {estadoEquipos?.ultimaLectura && (
                      <span>
                        Actualizado {formateaFecha(estadoEquipos.ultimaLectura)}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={refrescarEquipos}
                      disabled={Boolean(cargandoEquipos)}
                    >
                      {cargandoEquipos ? "Actualizando…" : "Actualizar"}
                    </Button>
                  </div>
                </div>

                {cargandoEquipos && (
                  <Card className="p-4 text-sm text-gray-600">Cargando equipos…</Card>
                )}

                {errorEquipos && !cargandoEquipos && (
                  <Card className="p-4 text-sm text-red-600">{errorEquipos}</Card>
                )}

                {!cargandoEquipos && !errorEquipos && resumenEquipos.length === 0 && (
                  <Card className="p-4 text-sm text-gray-600">
                    No se encontraron equipos asociados a este concurso en la base de datos.
                  </Card>
                )}

                {!cargandoEquipos && !errorEquipos && resumenEquipos.length > 0 && (
                  <div className="space-y-3">
                    {resumenEquipos.map((equipo, idx) => (
                      <div
                        key={equipo.id}
                        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-tecnm-azul/10 text-sm font-semibold text-tecnm-azul">
                                {idx + 1}
                              </span>
                              <div>
                                <p className="text-base font-semibold text-gray-900">{equipo.nombre}</p>
                                <p className="text-xs text-gray-500">
                                  {equipo.categoria || "Sin categoría"}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => abrirEquipo(equipo)}>
                              Ver
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-gray-500">Líder</p>
                            <p className="text-sm font-medium text-gray-900">{equipo.lider || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Contacto</p>
                            <p className="text-sm font-medium text-gray-900">{equipo.contacto || equipo.telefono || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Institución</p>
                            <p className="text-sm font-medium text-gray-900">{equipo.institucion || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Registrado</p>
                            <p className="text-sm font-medium text-gray-900">
                              {equipo.registradoEn ? formateaFecha(equipo.registradoEn) || "—" : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {equipoActivo &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{equipoActivo.nombre}</h3>
                  {equipoActivo.categoria && (
                    <p className="text-sm text-gray-500">Categoría: {equipoActivo.categoria}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={cerrarEquipo}
                  className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Cerrar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 6l12 12M6 18L18 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-gray-700">
                {equipoActivo.lider && (
                  <p>
                    <span className="font-semibold text-gray-900">Líder:</span> {equipoActivo.lider}
                  </p>
                )}
                {equipoActivo.contacto && (
                  <p>
                    <span className="font-semibold text-gray-900">Contacto:</span> {equipoActivo.contacto}
                  </p>
                )}
                {equipoActivo.telefono && (
                  <p>
                    <span className="font-semibold text-gray-900">Teléfono:</span> {equipoActivo.telefono}
                  </p>
                )}
                {equipoActivo.asesor && (
                  <p>
                    <span className="font-semibold text-gray-900">Asesor:</span> {equipoActivo.asesor}
                  </p>
                )}
                {equipoActivo.institucion && (
                  <p>
                    <span className="font-semibold text-gray-900">Institución:</span> {equipoActivo.institucion}
                  </p>
                )}
                {equipoActivo.escolaridad && (
                  <p>
                    <span className="font-semibold text-gray-900">Escolaridad:</span> {equipoActivo.escolaridad}
                  </p>
                )}
                {equipoActivo.registradoEn && (
                  <p>
                    <span className="font-semibold text-gray-900">Registrado:</span>{" "}
                    {formateaFecha(equipoActivo.registradoEn) || equipoActivo.registradoEn}
                  </p>
                )}

                {equipoActivo.integrantes.length > 0 && (
                  <div>
                    <p className="font-semibold text-gray-900">Integrantes:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {equipoActivo.integrantes.map((integrante, index) => (
                        <li key={`${equipoActivo.id}-integrante-${index}`}>{integrante}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {equipoActivo.integrantes.length === 0 && (
                  <p className="italic text-gray-500">No se encontraron integrantes registrados.</p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={cerrarEquipo}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </motion.div>
  )
}

/* ------------------------------ Página ------------------------------ */
export default function Concursos() {
  const [busqueda, setBusqueda] = useState<string>("")
  const [tab, setTab] = useState<EstadoConcurso | "Todos">("Todos")
  const [categoria, setCategoria] = useState<string>("Todas")

  // NUEVO: estado con datos de Firestore
  const [concursos, setConcursos] = useState<Concurso[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)
  const [equiposPorConcurso, setEquiposPorConcurso] = useState<Record<string, EstadoEquipos>>({})

  const cargarEquipos = useCallback(async (concurso: Concurso) => {
    setEquiposPorConcurso((prev) => {
      const anterior = prev[concurso.id]
      return {
        ...prev,
        [concurso.id]: {
          equipos: anterior?.equipos ?? [],
          cargando: true,
          error: null,
          ultimaLectura: anterior?.ultimaLectura,
        },
      }
    })

    try {
      const equipos = await obtenerEquiposDeEncuesta(concurso)
      setEquiposPorConcurso((prev) => ({
        ...prev,
        [concurso.id]: {
          equipos,
          cargando: false,
          error: null,
          ultimaLectura: new Date().toISOString(),
        },
      }))
    } catch (e) {
      console.error("Error al cargar equipos", e)
      setEquiposPorConcurso((prev) => ({
        ...prev,
        [concurso.id]: {
          equipos: prev[concurso.id]?.equipos ?? [],
          cargando: false,
          error: "No se pudieron cargar los equipos desde la encuesta.",
          ultimaLectura: new Date().toISOString(),
        },
      }))
    }
  }, [])

  const manejarSeleccion = useCallback(
    (concurso: Concurso) => {
      setSeleccionadoId((prev) => (prev === concurso.id ? null : concurso.id))
      const seAbrira = seleccionadoId !== concurso.id
      if (seAbrira) {
        const estado = equiposPorConcurso[concurso.id]
        if (!estado || estado.equipos.length === 0 || estado.error) {
          void cargarEquipos(concurso)
        }
      }
    },
    [cargarEquipos, equiposPorConcurso, seleccionadoId]
  )

  const manejarRefresco = useCallback(
    (concurso: Concurso) => {
      void cargarEquipos(concurso)
    },
    [cargarEquipos]
  )

  // Suscripción en tiempo real a la colección "Cursos"
  useEffect(() => {
    try {
      const ref = collection(db, "Cursos")
      // Ordena si tienes un campo fechaInicio/creadoEn; si no, Firestore ignora el orderBy
      const q = query(ref, orderBy("fechaInicio", "desc"))
      const unsub = onSnapshot(
        q,
        (snap) => {
          const rows: Concurso[] = snap.docs.map((d) => {
            const data: DocumentData = d.data() || {}

            // Intentamos mapear nombres posibles de tus campos
            const nombre = (data.nombre || data.titulo || data.curso || d.id) as string
            const categoria = (data.categoria || "General") as string
            const sede = (data.sede || data.lugar || "Por definir") as string

            const fechaInicio = toISO(data.fechaInicio || data.inicio || data.constancia?.actualizadoEn)
            const fechaFin = toISO(data.fechaFin || data.fin || data.constancia?.actualizadoEn)

            const participantesActual = Number(data.participantesActual ?? data.inscritos ?? 0)
            const participantesMax = Number(data.participantesMax ?? data.capacidad ?? 30)

            const estatus: EstadoConcurso =
              (data.estatus && safeEstado(data.estatus)) ||
              // heurística rápida por fechas
              (() => {
                const hoy = new Date()
                const ini = fechaInicio ? new Date(fechaInicio) : null
                const fin = fechaFin ? new Date(fechaFin) : null
                if (fin && fin < hoy) return "Finalizado"
                if (ini && ini > hoy) return "Próximo"
                return "Activo"
              })()

            const portadaUrl = (data.portadaUrl || data.plantilla?.url || "") as string

            return {
              id: d.id,
              nombre,
              categoria,
              sede,
              fechaInicio,
              fechaFin,
              estatus,
              participantesActual,
              participantesMax,
              portadaUrl,
            }
          })
          setConcursos(rows)
          setCargando(false)
          setError(null)
        },
        (err) => {
          console.error(err)
          setError("Error al cargar concursos.")
          setCargando(false)
        }
      )
      return () => unsub()
    } catch (e) {
      console.error(e)
      setError("Error al inicializar la lectura de concursos.")
      setCargando(false)
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

      {/* Estados de carga / error */}
      {cargando && <Card className="p-8 text-center text-sm text-gray-600">Cargando concursos…</Card>}
      {error && !cargando && <Card className="p-8 text-center text-sm text-red-600">{error}</Card>}

      {/* Resumen */}
      {!cargando && !error && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Resultados: <strong>{resultados.length}</strong></span>
        </div>
      )}

      {/* Grid */}
      {!cargando && !error && (
        resultados.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-600">No se encontraron concursos con esos filtros.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resultados.map((c) => (
              <TarjetaConcurso
                key={c.id}
                c={c}
                seleccionado={seleccionadoId === c.id}
                onSeleccionar={manejarSeleccion}
                estadoEquipos={equiposPorConcurso[c.id]}
                onRefrescar={manejarRefresco}
              />
            ))}
          </div>
        )
      )}
    </section>
  )
}
