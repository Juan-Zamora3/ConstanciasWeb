// src/router/routes.tsx
import { createBrowserRouter } from "react-router-dom"
import AppLayout from "../layouts/AppLayout"

// Páginas
import Home from "../pages/Home"
import Concursos from "../pages/Concursos"
import Plantillas from "../pages/Plantillas"
import Constancias from "../pages/Constancias"

// Constructor y público
import FormularioBuilder from "../pages/FormularioBuilder"
import FormularioPublico from "../pages/FormularioPublico"

// (opcionales) placeholders
const Equipos = () => <div>Equipos (próximo)</div>
const Participantes = () => <div>Participantes (próximo)</div>

export const router = createBrowserRouter([
  // App con navbar
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

      // Builder (con navbar)
      { path: "formulario-builder/:encuestaId", element: <FormularioBuilder /> },
    ],
  },

  // Público (SIN navbar)
  { path: "/formulario-publico/:encuestaId", element: <FormularioPublico /> },

  // 404
  { path: "*", element: <div style={{ padding: 24 }}>Página no encontrada</div> },
])
