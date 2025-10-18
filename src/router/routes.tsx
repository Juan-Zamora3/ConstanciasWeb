// src/router/routes.tsx
import { createBrowserRouter } from "react-router-dom"
import AppLayout from "../layouts/AppLayout"

// Páginas reales
import Home from "../pages/Home"
import Concursos from "../pages/Concursos"
import Plantillas from "../pages/Plantillas"
import Constancias from "../pages/Constancias"

// 🔵 NUEVO: constructor y público
import FormularioBuilder from "../pages/FormularioBuilder"
import FormularioPublico from "../pages/FormularioPublico"

// Placeholders (si los sigues usando)
const Equipos = () => <div>Equipos (próximo)</div>
const Participantes = () => <div>Participantes (próximo)</div>
const Login = () => <div>Login (próximo)</div>

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "concursos", element: <Concursos /> },
      { path: "concursos/:concursoId/equipos", element: <Equipos /> },
      { path: "concursos/:concursoId/equipos/:equipoId/participantes", element: <Participantes /> },
      { path: "plantillas", element: <Plantillas /> },
      { path: "constancias", element: <Constancias /> },

      // 🔵 Rutas necesarias para los botones del modal
      { path: "formulario-builder/:encuestaId", element: <FormularioBuilder /> },
      { path: "formulario-publico/:encuestaId", element: <FormularioPublico /> },
    ],
  },

  // 404
  { path: "*", element: <div style={{ padding: 24 }}>Página no encontrada</div> },
])
