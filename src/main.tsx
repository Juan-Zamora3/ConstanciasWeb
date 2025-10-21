// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { router } from "./router/routes";

// 👇 OJO: nombre correcto: tecnmFondo.png (n antes de m)
import bg from "./assets/tecnmFondo.png";

// Inyecta el fondo global
const style = document.createElement("style");
style.textContent = `
  html, body, #root {
    min-height: 100%;
    margin: 0;
    padding: 0;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      linear-gradient(0deg, rgba(255,255,255,.85), rgba(255,255,255,.85)),
      url(${bg}) center / cover no-repeat fixed;
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
