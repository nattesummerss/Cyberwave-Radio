import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./": o site funciona em qualquer endereço do GitHub Pages
// (https://usuario.github.io/nome-do-repositorio/) sem configurar nada.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  build: { outDir: "dist", emptyOutDir: true },
});
