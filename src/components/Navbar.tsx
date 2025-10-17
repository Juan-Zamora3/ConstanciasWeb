import { Link, NavLink } from "react-router-dom"

export default function Navbar() {
  const base = "px-3 py-1.5 rounded-full text-sm font-medium transition"
  const active = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? `${base} bg-white/20 text-white`
      : `${base} hover:bg-white/10 text-white/90`

  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-3 pt-3">
        <div className="rounded-2xl bg-gradient-to-r from-tecnm-azul to-tecnm-azul-700 text-white shadow-glass">
          <div className="flex items-center justify-between px-4 py-2.5">
            {/* Marca */}
            <Link to="/" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/95 flex items-center justify-center text-tecnm-azul font-bold">
                IT
              </div>
              <div className="leading-tight">
                <p className="font-semibold tracking-tight">ITSPP</p>
                <p className="text-[11px] text-white/85 -mt-0.5">
                  Ingeniería en Sistemas Computacionales
                </p>
              </div>
            </Link>

            {/* Navegación */}
            <nav className="flex items-center gap-1">
              <NavLink to="/" className={active}>Inicio</NavLink>
              <NavLink to="/concursos" className={active}>Concursos</NavLink>
              <NavLink to="/plantillas" className={active}>Plantillas</NavLink>
              <NavLink to="/constancias" className={active}>Constancias</NavLink>
            </nav>

            {/* Sesión */}
            <Link
              to="/login"
              className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-sm"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
