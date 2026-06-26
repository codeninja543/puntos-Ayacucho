import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

/**
 * Middleware: verifica el Bearer token de Supabase Auth.
 * Usa el proyecto MAIN (Auth + DB) — Auth nunca vive en el proyecto Storage.
 * Si el token es válido, adjunta req.user y req.session.
 * Si no hay token o es inválido, responde 401.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  // Cliente anon del proyecto MAIN para verificar el JWT del usuario
  const supabaseMain = createClient(
    process.env.SUPABASE_URL_MAIN,
    process.env.SUPABASE_ANON_KEY_MAIN,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabaseMain.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  req.user = data.user;
  next();
}

/**
 * Middleware: requiere que el usuario tenga rol 'admin'.
 * La tabla user_roles vive en la base de datos del proyecto MAIN.
 * Debe usarse después de requireAuth.
 */
export async function requireAdmin(req, res, next) {
  const { supabaseMainAdmin } = await import("../lib/supabase.js");

  const { data } = await supabaseMainAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", req.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!data) {
    return res.status(403).json({ error: "Acceso restringido a administradores" });
  }

  next();
}
