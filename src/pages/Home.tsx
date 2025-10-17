// src/pages/Home.tsx
import { motion } from "framer-motion"
import Button from "../components/ui/Button"
import AnimatedKpi from "../components/AnimatedKpi"
import { Card } from "../components/ui/Card"

const Icon = ({ path, className = "" }: { path: string; className?: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" className={className}>
    <path d={path} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
)

// Iconos con color institucional TecNM
const IUsers  = <Icon className="text-tecnm-azul" path="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 1 1 0 7.75" />
const ITrophy = <Icon className="text-tecnm-azul" path="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4ZM4 7h3v1a3 3 0 0 1-3-3v2ZM20 7h-3v1a3 3 0 0 0 3-3v2Z" />
const ICalend = <Icon className="text-tecnm-azul" path="M16 3v4M8 3v4M3 11h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
const ICheck  = <Icon className="text-tecnm-azul" path="m20 6-11 12-5-5" />

export default function Home() {
  return (
    <section className="space-y-6">
      {/* HERO animado con colores TecNM */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-tecnm-azul to-tecnm-azul-700 text-white p-6 shadow-glass"
      >
        {/* blur decorativo */}
        <motion.div
          className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/20 blur-3xl"
          animate={{ x: [0, 10, 0], y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow-sm">
              Sistema de Gestión de Concursos
            </h1>
            <p className="mt-1 text-sm text-white/90">
              Instituto Tecnológico Superior de Puerto Peñasco · Ingeniería en Sistemas Computacionales
            </p>
            <div className="mt-4 flex gap-2">
              <Button>Crear nuevo concurso</Button>
              <Button variant="ghost" onClick={() => (location.href = "/concursos")}>
                Ver concursos
              </Button>
            </div>
          </div>

          {/* Módulo “glass” */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="hidden md:block"
          >
            <div className="h-28 w-64 rounded-xl3 bg-white/15 border border-white/30 backdrop-blur-md shadow-glass" />
          </motion.div>
        </div>
      </motion.div>

      {/* KPIs animados */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AnimatedKpi titulo="Concursos Activos" valor={3} icon={ITrophy} />
        <AnimatedKpi titulo="Participantes Totales" valor={132} icon={IUsers} />
        <AnimatedKpi titulo="Próximos Eventos" valor={1} icon={ICalend} />
        <AnimatedKpi titulo="Completados" valor={12} icon={ICheck} />
      </div>

      {/* Dos columnas: vista rápida y paneles laterales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Concursos (preview) */}
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Concursos</h2>
              <p className="text-sm text-gray-500">Gestiona y monitorea todos los concursos</p>
            </div>
            <Button variant="outline" onClick={() => (location.href = "/concursos")}>
              Ir a Concursos
            </Button>
          </div>

          {/* Item interactivo */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="mt-4 rounded-xl2 border border-gray-100 p-4 flex items-center gap-4 bg-white"
          >
            <div className="h-12 w-12 rounded-xl bg-tecnm-azul/10 grid place-items-center text-tecnm-azul font-semibold">
              BD
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Concurso de Bases de Datos</h3>
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-tecnm-azul">Activo</span>
              </div>
              <p className="text-sm text-gray-500">Diseña y optimiza consultas SQL complejas</p>
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                <span>18/25 participantes</span>
                <span>·</span>
                <span>22 Nov 2025</span>
              </div>
            </div>
            <Button variant="outline" onClick={() => (location.href = "/concursos")}>
              Ver detalles
            </Button>
          </motion.div>
        </Card>

        {/* Paneles laterales */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-base font-semibold">Ganadores Recientes</h3>
            <p className="text-sm text-gray-500 mb-3">Últimos premiados</p>
            <ul className="space-y-3">
              {[
                { ini: "MG", nombre: "María González", evento: "Hackathon Primavera", chip: "1er Lugar" },
                { ini: "JP", nombre: "Juan Pérez", evento: "Concurso SQL", chip: "1er Lugar" },
                { ini: "AM", nombre: "Ana Martínez", evento: "Desafío Python", chip: "2do Lugar" },
              ].map((g, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-gray-100 grid place-items-center text-gray-700 text-sm font-semibold">
                      {g.ini}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{g.nombre}</p>
                      <p className="text-xs text-gray-500">{g.evento}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-tecnm-azul">{g.chip}</span>
                </motion.li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="text-base font-semibold">Anuncios</h3>
            <p className="text-sm text-gray-500 mb-3">Últimas noticias</p>
            <ul className="space-y-3 text-sm">
              <li>
                <p className="font-medium">Nuevo Hackathon Anunciado</p>
                <p className="text-gray-500">Inscripciones abiertas hasta el 20 de noviembre</p>
              </li>
              <li>
                <p className="font-medium">Resultados Maratón ACM</p>
                <p className="text-gray-500">Felicitamos a todos los participantes</p>
              </li>
              <li>
                <p className="font-medium">Taller de Preparación</p>
                <p className="text-gray-500">Este sábado a las 10:00 AM</p>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </section>
  )
}
