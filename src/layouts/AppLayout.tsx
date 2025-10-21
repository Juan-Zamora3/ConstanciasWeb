import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function AppLayout() {
  // ⬇️ Ajusta esto: 0 a 100 (porcentaje del ancho de viewport)
  const PAGE_SCALE = 75;       // p.ej. 95 = 95% del ancho
  const PAGE_MAX   = 1800;     // tope opcional en px (ajústalo o quítalo)

  return (
    <div
      className="min-h-dvh bg-gray-50"
      style={{
        // variables globales para todo el layout
        ['--page-pct' as any]: PAGE_SCALE,          // número 0..100
        ['--page-max' as any]: `${PAGE_MAX}px`,     // tope en px
      }}
    >
      <Navbar />
      <main className="mx-auto w-full max-w-[min(calc(var(--page-pct)*1vw),var(--page-max))] p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
