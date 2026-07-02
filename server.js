import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

import placesRouter from "./routes/places.js";
import authRouter from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares ────────────────────────────────
app.use(cors({
  origin: "*",
  credentials: false,
}));
app.use(express.json());

// ── API ────────────────────────────────────────
app.use("/api/places", placesRouter);
app.use("/api/auth", authRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ── Diagnóstico — confirma si las variables de entorno están bien
// cargadas, sin exponer las claves secretas. Visita /api/diagnostico
// en el navegador (local o producción) para verlo.
app.get("/api/diagnostico", (_req, res) => {
  res.json({
    SUPABASE_URL_MAIN: process.env.SUPABASE_URL_MAIN ? "✅ definida" : "❌ FALTA",
    SUPABASE_ANON_KEY_MAIN: process.env.SUPABASE_ANON_KEY_MAIN ? "✅ definida" : "❌ FALTA",
    SUPABASE_SERVICE_ROLE_KEY_MAIN: process.env.SUPABASE_SERVICE_ROLE_KEY_MAIN ? "✅ definida" : "❌ FALTA",
  });
});

// ── Servir el frontend ya compilado (producción) ───────────────────────
// Soporta dos ubicaciones posibles de "dist" según cómo esté armado el
// repo: backend/dist (si el build se copia ahí) o ../frontend/dist
// (si el repo tiene carpetas frontend/ y backend/ separadas, como en
// este proyecto). Usa la primera que exista; si ninguna existe (por
// ejemplo en desarrollo local, donde el frontend corre con Vite en
// otro puerto), simplemente no sirve estáticos y deja que las rutas
// /api/* sigan funcionando igual.
const candidateDistPaths = [
  path.join(__dirname, "dist"),
  path.join(__dirname, "..", "frontend", "dist"),
];
const distPath = candidateDistPaths.find((p) => fs.existsSync(p));

if (distPath) {
  console.log(`📦 Sirviendo frontend estático desde: ${distPath}`);
  app.use(express.static(distPath));

  // Cualquier ruta que no sea /api/* devuelve index.html (React Router)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  console.warn("⚠️  No se encontró carpeta dist del frontend — modo solo-API (normal en desarrollo con Vite aparte).");
}

// 404 catch-all (solo llega aquí si no hay dist, o si es una ruta /api/* inexistente)
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ── Start ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});