import { Router } from "express";
import { supabaseMain, supabaseMainAdmin, supabaseMainConfigured } from "../lib/supabase.js";

/**
 * Rutas de autenticación.
 *
 * TODA la lógica de Supabase Auth vive aquí. El frontend NUNCA habla con
 * Supabase directamente — solo llama a estos endpoints y guarda el
 * access_token/refresh_token que le devolvemos (en localStorage, por ej).
 *
 * Esto evita exponer la URL/anon key de Supabase en el bundle del navegador.
 */

const router = Router();

function notConfigured(res) {
  return res.status(503).json({ error: "Supabase no está configurado en el servidor." });
}

// ──────────────────────────────────────────────
// POST /api/auth/signup
// Body: { email, password, full_name }
// ──────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email y password son obligatorios" });
    }

    const { data, error } = await supabaseMain.auth.signUp({
      email,
      password,
      options: { data: { full_name: full_name || null } },
    });

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({
      user: data.user,
      session: data.session, // null si requiere confirmación de email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/signin
// Body: { email, password }
// ──────────────────────────────────────────────
router.post("/signin", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email y password son obligatorios" });
    }

    const { data, error } = await supabaseMain.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    const isAdmin = await checkIsAdmin(data.user.id);
    res.json({ user: data.user, session: data.session, isAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/signout
// Header: Authorization: Bearer <access_token>
// ──────────────────────────────────────────────
router.post("/signout", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const token = (req.headers.authorization ?? "").replace("Bearer ", "");
    if (token) {
      // signOut con el token del usuario invalida esa sesión en Supabase
      await supabaseMain.auth.admin?.signOut?.(token).catch(() => {});
    }
    res.json({ success: true });
  } catch {
    // El cierre de sesión en el cliente (borrar localStorage) es lo
    // importante; no fallamos la petición si Supabase no responde.
    res.json({ success: true });
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/refresh
// Body: { refresh_token }
// Renueva la sesión cuando el access_token expira.
// ──────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: "refresh_token es obligatorio" });
    }

    const { data, error } = await supabaseMain.auth.refreshSession({ refresh_token });
    if (error) return res.status(401).json({ error: error.message });

    res.json({ user: data.user, session: data.session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/auth/me
// Header: Authorization: Bearer <access_token>
// Devuelve el usuario actual + si es admin, a partir del token.
// El frontend llama esto al cargar la app para restaurar la sesión.
// ──────────────────────────────────────────────
router.get("/me", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const token = (req.headers.authorization ?? "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No autenticado" });

    const { data, error } = await supabaseMain.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Token inválido o expirado" });

    const isAdmin = await checkIsAdmin(data.user.id);
    res.json({ user: data.user, isAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { email }
// ──────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email es obligatorio" });

    const { error } = await supabaseMain.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.FRONTEND_URL || undefined,
    });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/auth/google
// Devuelve la URL de OAuth de Google para que el navegador redirija.
// El frontend hace: window.location.href = url
// ──────────────────────────────────────────────
router.get("/google", async (req, res) => {
  if (!supabaseMainConfigured) return notConfigured(res);
  try {
    const { data, error } = await supabaseMain.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: process.env.FRONTEND_URL || undefined,
        skipBrowserRedirect: true, // queremos la URL, no que el server redirija
      },
    });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ url: data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper interno ──────────────────────────────────────────────────────
async function checkIsAdmin(userId) {
  try {
    const { data } = await supabaseMainAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export default router;
