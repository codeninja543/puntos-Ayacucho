import { Router } from "express";
import multer from "multer";
import { supabaseStorageAdmin, supabaseStorageConfigured } from "../lib/supabase.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";



const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const DEFAULT_BUCKET = "places-images";

// ──────────────────────────────────────────────
// POST /api/upload  (solo admin) — sube 1 imagen, devuelve su URL pública
// Form field esperado: "file"
// ──────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  try {
    if (!supabaseStorageConfigured) {
      return res.status(503).json({ error: "Supabase Storage no está configurado en el servidor." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ningún archivo (campo 'file')." });
    }

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `places/${Date.now()}-${safeName}`;

    const { error } = await supabaseStorageAdmin.storage
      .from(DEFAULT_BUCKET)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabaseStorageAdmin.storage.from(DEFAULT_BUCKET).getPublicUrl(path);
    res.status(201).json({ path, publicUrl: data.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/upload  (solo admin) — borra una imagen dado su path
// Body: { path: "places/123-foto.jpg" }
// ──────────────────────────────────────────────
router.delete("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!supabaseStorageConfigured) {
      return res.status(503).json({ error: "Supabase Storage no está configurado en el servidor." });
    }
    const { path } = req.body;
    if (!path) {
      return res.status(400).json({ error: "Falta 'path' en el body." });
    }

    const { error } = await supabaseStorageAdmin.storage.from(DEFAULT_BUCKET).remove([path]);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
