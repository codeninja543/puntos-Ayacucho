import { supabaseMain, supabaseMainAdmin } from "../lib/supabase.js";
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
  try {
    if (!supabaseMainAdmin) {
      console.warn("❌ requireAdmin: supabaseMainAdmin no disponible (falta service role key)");
      return res.status(403).json({ error: "Acceso restringido a administradores" });
    }

    const { data: profileData, error: profileError } = await supabaseMainAdmin
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("❌ requireAdmin: error consultando profiles:", profileError);
      return res.status(500).json({ error: "Error verificando permisos de administrador" });
    }

    if (!profileData) {
      const { error: insertError } = await supabaseMainAdmin.from("profiles").insert({ id: req.user.id, role: "user" });
      if (insertError) {
        console.warn("⚠️  requireAdmin: no se pudo inicializar profiles para el usuario:", insertError.message);
      }
    }

    const { data, error } = await supabaseMainAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", req.user.id)
      .ilike("role", "%admin%")
      .maybeSingle();

    if (error) {
      console.error("❌ requireAdmin: error consultando user_roles:", error);
      return res.status(500).json({ error: "Error verificando permisos de administrador" });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    const roleValue = profileData?.role;
    const isAdminByProfile = typeof roleValue === "string" && /admin/i.test(roleValue);

    if (isAdminByProfile || data || (req.user.email && adminEmails.includes(req.user.email.toLowerCase()))) {
      next();
      return;
    }

    return res.status(403).json({ error: "Acceso restringido a administradores" });
  } catch (err) {
    console.error("❌ requireAdmin falló inesperadamente:", err);
    res.status(500).json({ error: "Error verificando permisos" });
  }
}
