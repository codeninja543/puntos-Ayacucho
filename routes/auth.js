import "dotenv/config";
import { Router } from "express";
import { supabaseMain, supabaseMainAdmin } from "../lib/supabase.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function hasAdminRole(value) {
  return typeof value === "string" && /admin/i.test(value);
}

function isMissingTableError(error) {
  const msg = error?.message?.toString?.().toLowerCase?.() ?? "";
  return msg.includes("relation \"user_roles\" does not exist")
    || msg.includes("relation \"profiles\" does not exist")
    || msg.includes("table \"user_roles\" does not exist")
    || msg.includes("table \"profiles\" does not exist")
    || msg.includes("could not find the table");
}

async function getProfileRole(userId) {
  try {
    const client = supabaseMainAdmin || supabaseMain;
    const { data, error } = await client
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        console.warn("⚠️  getProfileRole: tabla profiles no existe, usando fallback");
        return null;
      }
      console.warn("⚠️  getProfileRole error:", error.message);
      return null;
    }

    if (data?.role) {
      return data.role;
    }

    const { error: insertError } = await client.from("profiles").insert({ id: userId, role: "user" });
    if (insertError && !/duplicate key|already exists|23505/i.test(insertError.message || "")) {
      console.warn("⚠️  No se pudo crear el perfil del usuario:", insertError.message);
    }

    return null;
  } catch (err) {
    console.warn("⚠️  getProfileRole failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function checkIsAdmin(userId, user = null) {
  try {
    const profileRole = await getProfileRole(userId);
    if (hasAdminRole(profileRole)) {
      return true;
    }

    const client = supabaseMainAdmin || supabaseMain;
    const byId = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .ilike("role", "%admin%")
      .maybeSingle();

    if (byId.error) {
      console.warn("⚠️  checkIsAdmin error by user_id:", byId.error.message);
    }
    if (byId.data) return true;

    if (user?.email) {
      const byEmail = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", user.email)
        .ilike("role", "%admin%")
        .maybeSingle();

      if (byEmail.error) {
        console.warn("⚠️  checkIsAdmin error by email fallback:", byEmail.error.message);
      }
      if (byEmail.data) return true;
    }

    const roleMetadata = user?.user_metadata?.role ?? user?.app_metadata?.role;
    if (hasAdminRole(roleMetadata)) {
      return true;
    }

    const rolesArray = user?.user_metadata?.roles ?? user?.app_metadata?.roles;
    if (Array.isArray(rolesArray) && rolesArray.some((role) => hasAdminRole(role))) {
      return true;
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (user?.email && adminEmails.includes(user.email.toLowerCase())) {
      return true;
    }

    return false;
  } catch (err) {
    console.warn("⚠️  checkIsAdmin failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

router.post("/signup", async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const { data, error } = await supabaseMain.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) throw error;

    if (data.user?.id) {
      const client = supabaseMainAdmin || supabaseMain;
      try {
        await client.from("profiles").upsert({ id: data.user.id, role: "user" }, { onConflict: "id" });
      } catch (upsertErr) {
        console.warn("⚠️  No se pudo inicializar el perfil del usuario:", upsertErr);
      }
    }

    res.status(201).json({ user: data.user, session: data.session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const { data, error } = await supabaseMain.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profileRole = data.user ? await getProfileRole(data.user.id) : null;
    const isAdmin = data.user ? await checkIsAdmin(data.user.id, data.user) : false;
    res.json({ user: data.user, session: data.session, isAdmin, role: profileRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/signout", async (req, res) => {
  res.json({ success: true });
});

router.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: "Refresh token required" });
    const { data, error } = await supabaseMain.auth.refreshSession({ refresh_token });
    if (error) throw error;
    res.json({ user: data.user, session: data.session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const { data, error } = await supabaseMain.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid token" });
    const profileRole = await getProfileRole(data.user.id);
    const isAdmin = await checkIsAdmin(data.user.id, data.user);
    res.json({ user: data.user, isAdmin, role: profileRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/debug", requireAuth, async (req, res) => {
  try {
    const client = supabaseMainAdmin || supabaseMain;
    const [byId, byEmail] = await Promise.all([
      client
        .from("user_roles")
        .select("role")
        .eq("user_id", req.user.id)
        .ilike("role", "%admin%")
        .maybeSingle(),
      req.user.email
        ? client
            .from("user_roles")
            .select("role")
            .eq("user_id", req.user.email)
            .ilike("role", "%admin%")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const isAdmin = await checkIsAdmin(req.user.id, req.user);
    res.json({
      user: req.user,
      isAdmin,
      user_roles_by_id: byId.data,
      user_roles_by_email: byEmail.data,
      env: {
        SUPABASE_URL_MAIN: Boolean(process.env.SUPABASE_URL_MAIN),
        SUPABASE_ANON_KEY_MAIN: Boolean(process.env.SUPABASE_ANON_KEY_MAIN),
        SUPABASE_SERVICE_ROLE_KEY_MAIN: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY_MAIN),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    await supabaseMain.auth.resetPasswordForEmail(email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/google", async (_req, res) => {
  try {
    const redirectTo = process.env.GOOGLE_CALLBACK_URL || process.env.FRONTEND_URL || "http://localhost:5173/";
    const { data, error } = await supabaseMain.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        scopes: ["email", "profile"],
      },
    });

    if (error) throw error;

    res.json({ url: data?.url ?? null });
  } catch (err) {
    console.error("❌ Error iniciando OAuth con Google:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudo iniciar con Google" });
  }
});

// ──────────────────────────────────────────────
// GET /api/auth/users  (solo admin)
// Lista todos los usuarios registrados: email, si entraron con Google
// o con contraseña, fecha de registro y último acceso.
// ──────────────────────────────────────────────
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!supabaseMainAdmin) {
      return res.status(500).json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY_MAIN en el backend" });
    }

    const perPage = 1000;
    let page = 1;
    let allUsers = [];

    // Supabase pagina de a máximo ~1000 usuarios por llamada; recorremos
    // todas las páginas por si hay más de 1000 registrados.
    while (true) {
      const { data, error } = await supabaseMainAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const pageUsers = data?.users ?? [];
      allUsers = allUsers.concat(pageUsers);

      if (pageUsers.length < perPage) break;
      page += 1;
      if (page > 20) break; // límite de seguridad (20,000 usuarios)
    }

    const users = allUsers
      .map((u) => {
        const identities = Array.isArray(u.identities) ? u.identities : [];
        const providers = identities.length
          ? identities.map((i) => i.provider)
          : [u.app_metadata?.provider].filter(Boolean);

        return {
          id: u.id,
          email: u.email ?? null,
          full_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
          avatar_url: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
          providers: providers.length ? providers : ["email"],
          created_at: u.created_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
        };
      })
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));

    res.json({ users, total: users.length });
  } catch (err) {
    console.error("❌ GET /api/auth/users falló:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "No se pudo obtener la lista de usuarios" });
  }
});

export default router;