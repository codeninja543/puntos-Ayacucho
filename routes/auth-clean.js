import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const MAIN_URL = process.env.SUPABASE_URL_MAIN;
const MAIN_ANON_KEY = process.env.SUPABASE_ANON_KEY_MAIN;

const supabaseMain = createClient(
  MAIN_URL || "https://placeholder.supabase.co",
  MAIN_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder",
  { auth: { persistSession: false } }
);

async function checkIsAdmin(userId) {
  try {
    const { supabaseMainAdmin } = await import("../lib/supabase.js");
    if (!supabaseMainAdmin) return false;
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

router.post("/signup", async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const { data, error } = await supabaseMain.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) throw error;
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
    const isAdmin = data.user ? await checkIsAdmin(data.user.id) : false;
    res.json({ user: data.user, session: data.session, isAdmin });
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
    const isAdmin = await checkIsAdmin(data.user.id);
    res.json({ user: data.user, isAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.get("/google", (req, res) => {
  res.json({ success: true });
});

export default router;
