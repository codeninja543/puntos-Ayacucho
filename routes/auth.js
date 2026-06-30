import "dotenv/config";
import { Router } from "express";
import { supabaseMain, supabaseMainAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function hasAdminRole(value) {
  return typeof value === "string" && /admin/i.test(value);
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

export default router;