import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import placesRouter from "./routes/places.js";
import uploadRouter from "./routes/upload.js";
import authRouter from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Obtener __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Middlewares ────────────────────────────────
app.use(cors({
  origin: "*",
  credentials: false,
}));
app.use(express.json());

// ── API ────────────────────────────────────────
app.use("/api/places", placesRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/auth", authRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ── Servir React/Vite ──────────────────────────
app.use(express.static(path.join(__dirname, "dist")));

// Para rutas del frontend (React Router)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ── Start ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}`);
});