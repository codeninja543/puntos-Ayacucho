import { Router } from "express";
import { supabaseMainAdmin } from "../lib/supabase.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function normalizePlaceMetrics(place) {
  if (!place) return place;
  return {
    ...place,
    views: Number(place.views ?? 0) || 0,
    reservations: Number(place.reservations ?? place.reservation_count ?? place.bookings ?? 0) || 0,
    direction_clicks: Number(place.direction_clicks ?? place.directions_clicks ?? 0) || 0,
    // Si el lugar no tiene días configurados (null/undefined), asumimos que
    // atiende todos los días en vez de mostrarlo como "cerrado" siempre.
    open_days: Array.isArray(place.open_days) ? place.open_days : [0, 1, 2, 3, 4, 5, 6],
  };
}

// ──────────────────────────────────────────────
// Incrementa un contador (views / reservations / direction_clicks)
// de forma atómica usando la función SQL increment_place_counter
// (ver migración en backend/sql/counters.sql). Si la función RPC no
// existe todavía en la base de datos, hace fallback a leer+escribir
// directamente sobre la columna, y deja bien claro en los logs cuál
// es el problema real en vez de fallar en silencio.
// ──────────────────────────────────────────────
async function incrementPlaceCounter(placeId, column) {
  // 1) Intento atómico vía RPC (evita condiciones de carrera)
  const { error: rpcError } = await supabaseMainAdmin.rpc("increment_place_counter", {
    p_place_id: placeId,
    p_column: column,
  });

  if (!rpcError) return true;

  const rpcMessage = String(rpcError?.message || "");
  const rpcMissing = rpcMessage.includes("does not exist") || rpcMessage.includes("Could not find");
  if (!rpcMissing) {
    console.warn(`⚠️ RPC increment_place_counter falló para ${column} en ${placeId}:`, rpcError.message);
  }

  // 2) Fallback: leer valor actual y escribir +1
  try {
    const { data, error: selectError } = await supabaseMainAdmin
      .from("places")
      .select(column)
      .eq("id", placeId)
      .maybeSingle();

    if (selectError) {
      console.error(`❌ La columna "${column}" no existe o no se pudo leer en "places":`, selectError.message);
      return false;
    }
    if (!data) {
      console.warn(`⚠️ No se encontró el lugar ${placeId} al incrementar ${column}`);
      return false;
    }

    const currentValue = Number(data[column] ?? 0) || 0;
    const { error: updateError } = await supabaseMainAdmin
      .from("places")
      .update({ [column]: currentValue + 1 })
      .eq("id", placeId);

    if (updateError) {
      console.error(`❌ No se pudo actualizar "${column}" para el lugar ${placeId}:`, updateError.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`❌ Error inesperado al incrementar "${column}" en el lugar ${placeId}:`, err);
    return false;
  }
}

// ──────────────────────────────────────────────
// Rotación diaria por turnos (round-robin)
//
// Cada 24 horas, un negocio distinto pasa a ser el primero de la lista.
// No usa azar: es un desplazamiento (rotate) determinista basado en
// cuántos días han pasado desde una fecha de referencia fija, así que
// es reproducible y justo — con el tiempo todos los negocios tienen su
// turno de aparecer primero.
// ──────────────────────────────────────────────
const ROTATION_EPOCH = new Date("2026-01-01T00:00:00Z").getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDailyRotationOffset(totalItems) {
  if (!totalItems || totalItems <= 0) return 0;
  const daysSinceEpoch = Math.floor((Date.now() - ROTATION_EPOCH) / ONE_DAY_MS);
  return daysSinceEpoch % totalItems;
}

/** Rota el array de modo que el elemento en `offset` pase a ser el primero. */
function applyDailyRotation(items) {
  try {
    const offset = getDailyRotationOffset(items.length);
    if (offset === 0) return items;
    return [...items.slice(offset), ...items.slice(0, offset)];
  } catch (e) {
    // Si algo falla en la rotación, nunca debe tumbar el endpoint:
    // devolvemos el orden original sin rotar.
    console.error("⚠️ Error en applyDailyRotation, usando orden sin rotar:", e);
    return items;
  }
}

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
      .select("*")
      .order("created_at", { ascending: true });

    if (category && category !== "all") {
      if (category === "__otros__") {
        const main = [
          "pizzas_karaoke", "pizzas", "karaoke", "cafe", "discotecas",
          "tabernas", "cevicherias", "bares", "heladerias",
          "recreo", "emprendimientos", "pasteleria", "hamburguesas", "antojitos",
        ];
        query = query.not("category", "in", `(${main.join(",")})`);
      } else {
        query = query.eq("category", category);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error("❌ Error consultando places en GET /api/places:", error);
      throw error;
    }

    const rotated = applyDailyRotation((data ?? []).map(normalizePlaceMetrics));
    res.json(rotated.slice(0, safeLimit));
  } catch (err) {
    console.error("❌ GET /api/places falló:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor" });
  }
});

// ──────────────────────────────────────────────
// GET /api/places/featured
// 8 lugares para el carousel, con la misma rotación diaria que el grid
// ──────────────────────────────────────────────
router.get("/featured", async (_req, res) => {
  try {
    const { data, error } = await supabaseMainAdmin
      .from("places")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Error consultando places en GET /api/places/featured:", error);
      throw error;
    }

    const rotated = applyDailyRotation((data ?? []).map(normalizePlaceMetrics));
    res.json(rotated.slice(0, 8));
  } catch (err) {
    console.error("❌ GET /api/places/featured falló:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor" });
  }
});

// ──────────────────────────────────────────────
// POST /api/places/:id/reserve
// Incrementa el contador de reservas del negocio
// ──────────────────────────────────────────────
router.post("/:id/reserve", async (req, res) => {
  try {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(404).json({ error: "Lugar no encontrado" });
    }

    const ok = await incrementPlaceCounter(id, "reservations");
    if (!ok) {
      return res.status(500).json({
        success: false,
        error: "No se pudo registrar la reserva. Verifica que la tabla 'places' tenga la columna 'reservations' (ver backend/sql/counters.sql).",
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ POST /api/places/:id/reserve falló:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/places/:id/directions
// Incrementa el contador de clics en "Cómo llegar"
// ──────────────────────────────────────────────
router.post("/:id/directions", async (req, res) => {
  try {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(404).json({ error: "Lugar no encontrado" });
    }

    const ok = await incrementPlaceCounter(id, "direction_clicks");
    if (!ok) {
      return res.status(500).json({
        success: false,
        error: "No se pudo registrar el clic en 'Cómo llegar'. Verifica que la tabla 'places' tenga la columna 'direction_clicks' (ver backend/sql/counters.sql).",
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ POST /api/places/:id/directions falló:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/places/:id/rate
// Guarda una calificación de 1 a 5 y actualiza el promedio
// ──────────────────────────────────────────────
router.post("/:id/rate", async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body ?? {};
    const numericRating = Number(rating);
    const safeRating = Math.max(1, Math.min(5, Math.round(numericRating || 0)));

    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: "La calificación debe estar entre 1 y 5" });
    }

    const { error: insertError } = await supabaseMainAdmin
      .from("place_ratings")
      .insert({ place_id: id, rating: safeRating });

    if (insertError) {
      const message = String(insertError?.message || "");
      if (!message.includes("does not exist") && !message.includes("Could not find") && !message.includes("relation") && !message.includes("table")) {
        console.warn("⚠️ No se pudo guardar la calificación en place_ratings:", insertError.message);
      }

      const { data: placeData, error: placeError } = await supabaseMainAdmin
        .from("places")
        .select("rating")
        .eq("id", id)
        .maybeSingle();

      if (placeError) throw placeError;

      const { error: updateError } = await supabaseMainAdmin
        .from("places")
        .update({ rating: safeRating })
        .eq("id", id);

      if (updateError) throw updateError;

      return res.json({ rating: safeRating, rating_count: 1 });
    }

    const { data: rows, error: rowsError } = await supabaseMainAdmin
      .from("place_ratings")
      .select("rating")
      .eq("place_id", id);

    if (rowsError) throw rowsError;

    const values = (rows ?? []).map(item => Number(item.rating) || 0).filter(Boolean);
    const average = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : safeRating;

    const { error: updateError } = await supabaseMainAdmin
      .from("places")
      .update({ rating: average, rating_count: values.length })
      .eq("id", id);

    if (updateError) throw updateError;

    res.json({ rating: average, rating_count: values.length });
  } catch (err) {
    console.error("❌ POST /api/places/:id/rate falló:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor" });
  }
});

// ──────────────────────────────────────────────
// GET /api/places/:id
// Detalle completo + lugares relacionados
// ──────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
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

    const nextViews = (Number(place.views ?? 0) || 0) + 1;
    const viewsOk = await incrementPlaceCounter(id, "views");
    if (!viewsOk) {
      console.error(`❌ No se pudo incrementar "views" para el lugar ${id}. Verifica que la columna exista (ver backend/sql/counters.sql).`);
    }

    const { data: related } = await supabaseMainAdmin
      .from("places")
      .select("*")
      .eq("category", place.category)
      .neq("id", id)
      .order("rating", { ascending: false })
      .limit(6);

    res.json({
      place: normalizePlaceMetrics({ ...place, views: nextViews }),
      related: (related ?? []).map(normalizePlaceMetrics),
    });
  } catch (err) {
    console.error("❌ GET /api/places/:id falló:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/places  (solo admin)
// ──────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      name, category, description, address, website, phone, delivery_phone,
      photo_url_1, photo_url_2, photo_url_3,
      promotion, how_to_get_there, map_url,
      opening_hours, opens_at, closes_at, open_days, rating,
    } = req.body;

    if (!name || !category || !description || !address || !photo_url_1) {
      return res.status(400).json({ error: "Campos obligatorios: name, category, description, address, photo_url_1" });
    }

    const isUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const payload = {
      name, category, description, address,
      website: website || null,
      phone: phone || null,
      delivery_phone: delivery_phone || null,
      photo_url_1,
      photo_url_2: photo_url_2 || null,
      photo_url_3: photo_url_3 || null,
      promotion: promotion || null,
      how_to_get_there: how_to_get_there || null,
      map_url: map_url || null,
      opening_hours: opening_hours || null,
      opens_at: opens_at || null,
      closes_at: closes_at || null,
      open_days: Array.isArray(open_days) ? open_days : [0, 1, 2, 3, 4, 5, 6],
      rating: Math.max(0, Math.min(5, parseFloat(rating) || 0)),
      created_by: isUuid(req.user?.id) ? req.user.id : null,
    };

    const { data, error } = await supabaseMainAdmin
      .from("places")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error("❌ POST /api/places falló:", err);
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
      name, category, description, address, website, phone, delivery_phone,
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
      delivery_phone: delivery_phone || null,
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
    console.error("❌ PUT /api/places/:id falló:", err);
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
    console.error("❌ DELETE /api/places/:id falló:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;