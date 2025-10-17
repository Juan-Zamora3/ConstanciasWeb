/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // TecNM / ITSPP
        tecnm: {
          azul: "#002F6C",     // Pantone 294 C
          "azul-700": "#133B6C", // variante para hover/degradados
          gris10: "#63666A",   // Cool Gray 10 C
          negro: "#000000",
          blanco: "#FFFFFF",
        },
      },
      boxShadow: {
        soft: "0 8px 24px rgba(2, 6, 23, 0.06)",
        glass: "inset 0 1px 0 rgba(255,255,255,.4), 0 10px 30px rgba(2,6,23,.08)",
      },
      borderRadius: {
        xl2: "1rem",
        xl3: "1.25rem",
      },
    },
  },
  plugins: [],
}
