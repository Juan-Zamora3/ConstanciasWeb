import { createBrowserRouter } from "react-router-dom"
import AppLayout from "../layouts/AppLayout"

// Páginas reales
import Home from "../pages/Home"
import Concursos from "../pages/Concursos"
import Plantillas from "../pages/Plantillas"
import Constancias from "../pages/Constancias"   // 👈 importa la página real

// Placeholders temporales
const Equipos = () => <div>Equipos (próximo)</div>
const Participantes = () => <div>Participantes (próximo)</div>
const Login = () => <div>Login (próximo)</div>

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "concursos", element: <Concursos /> },
      { path: "concursos/:concursoId/equipos", element: <Equipos /> },
      { path: "concursos/:concursoId/equipos/:equipoId/participantes", element: <Participantes /> },
      { path: "plantillas", element: <Plantillas /> },
      { path: "constancias", element: <Constancias /> },   // 👈 ya usa la página real
      { path: "concursos/:concursoId/editar", element: <div>Editor de concurso (próximo)</div> },
    ],
  },
  { path: "*", element: <div style={{ padding: 24 }}>Página no encontrada</div> },
])
