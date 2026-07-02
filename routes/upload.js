import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, requireAdmin, (_req, res) => {
  res.status(410).json({ error: "La subida de archivos a Supabase Storage está deshabilitada en este proyecto." });
});

router.delete("/", requireAuth, requireAdmin, (_req, res) => {
  res.status(410).json({ error: "La eliminación de archivos desde Supabase Storage está deshabilitada en este proyecto." });
});

export default router;
