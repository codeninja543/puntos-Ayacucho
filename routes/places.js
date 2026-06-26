import { Router } from "express";
import { supabaseMainAdmin } from "../lib/supabase.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// ──────────────────────────────────────────────
// GET /api/places
// Parámetros opcionales: category (string), limit (number, máx 100)
// ──────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category, limit = 50 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 100);

    let query = supabaseMainAdmin
      .from("places")
      .select(
        "id,name,category,description,address,photo_url_1,promotion,rating,opens_at,closes_at,open_days"
      )
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (category && category !== "all") {
      if (category === "__otros__") {
        // Categorías que no son las principales
        const main = [
          "pizzas", "cafe", "karaoke", "discotecas",
          "tabernas", "chifas", "pollerias", "bares",
        ];
        query = query.not("category", "in", `(${main.join(",")})`);
      } else {
        query = query.eq("category", category);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/places/featured
// Últimos 8 lugares para el carousel
// ──────────────────────────────────────────────
router.get("/featured", async (_req, res) => {
  try {
    const { data, error } = await supabaseMainAdmin
      .from("places")
      .select(
        "id,name,category,description,address,photo_url_1,promotion,rating,opens_at,closes_at,open_days"
      )
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/places/:id
// Detalle completo + lugares relacionados
// ──────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(404).json({ error: "Lugar no encontrado" });
    }

    const { data: place, error } = await supabaseMainAdmin
      .from("places")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching place:", id, error.message);
      throw error;
    }
    if (!place) {
      console.warn("Place not found for id:", id);
      return res.status(404).json({ error: "Lugar no encontrado" });
    }

    // Lugares relacionados (misma categoría, sin este)
    const { data: related } = await supabaseMainAdmin
      .from("places")
      .select("id,name,category,description,photo_url_1,photo_url_2,photo_url_3,rating,address,promotion,opens_at,closes_at,open_days,opening_hours")
      .eq("category", place.category)
      .neq("id", id)
      .order("rating", { ascending: false })
      .limit(6);

    res.json({ place, related: related ?? [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/places  (solo admin)
// ──────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      name, category, description, address, website, phone,
      photo_url_1, photo_url_2, photo_url_3,
      promotion, how_to_get_there, map_url,
      opening_hours, opens_at, closes_at, open_days, rating,
    } = req.body;

    if (!name || !category || !description || !address || !photo_url_1) {
      return res.status(400).json({ error: "Campos obligatorios: name, category, description, address, photo_url_1" });
    }

    const payload = {
      name, category, description, address,
      website: website || null,
      phone: phone || null,
      photo_url_1,
      photo_url_2: photo_url_2 || null,
      photo_url_3: photo_url_3 || null,
      promotion: promotion || null,
      how_to_get_there: how_to_get_there || null,
      map_url: map_url || null,
      opening_hours: opening_hours || null,
      opens_at: opens_at || null,
      closes_at: closes_at || null,
      open_days: open_days ?? [0, 1, 2, 3, 4, 5, 6],
      rating: Math.max(0, Math.min(5, parseFloat(rating) || 0)),
      created_by: req.user.id,
    };

    const { data, error } = await supabaseMainAdmin
      .from("places")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// PUT /api/places/:id  (solo admin)
// ──────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, category, description, address, website, phone,
      photo_url_1, photo_url_2, photo_url_3,
      promotion, how_to_get_there, map_url,
      opening_hours, opens_at, closes_at, open_days, rating,
    } = req.body;

    if (!name || !category || !description || !address || !photo_url_1) {
      return res.status(400).json({ error: "Campos obligatorios: name, category, description, address, photo_url_1" });
    }

    const payload = {
      name, category, description, address,
      website: website || null,
      phone: phone || null,
      photo_url_1,
      photo_url_2: photo_url_2 || null,
      photo_url_3: photo_url_3 || null,
      promotion: promotion || null,
      how_to_get_there: how_to_get_there || null,
      map_url: map_url || null,
      opening_hours: opening_hours || null,
      opens_at: opens_at || null,
      closes_at: closes_at || null,
      open_days: open_days ?? [0, 1, 2, 3, 4, 5, 6],
      rating: Math.max(0, Math.min(5, parseFloat(rating) || 0)),
    };

    const { data, error } = await supabaseMainAdmin
      .from("places")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/places/:id  (solo admin)
// ──────────────────────────────────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseMainAdmin
      .from("places")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;