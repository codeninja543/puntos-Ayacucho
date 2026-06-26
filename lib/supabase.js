import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * DOS PROYECTOS DE SUPABASE SEPARADOS (igual que en el frontend):
 *
 *   1) supabaseMain / supabaseMainAdmin    → Auth + Base de datos
 *   2) supabaseStorage / supabaseStorageAdmin → SOLO Storage de imágenes
 *
 * No mezclar: las rutas de /places (DB) deben usar supabaseMain*.
 * Las rutas de subida/borrado de imágenes deben usar supabaseStorage*.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Proyecto MAIN (Auth + DB) ───────────────────────────────────────────
const MAIN_URL = process.env.SUPABASE_URL_MAIN;
const MAIN_ANON_KEY = process.env.SUPABASE_ANON_KEY_MAIN;
const MAIN_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_MAIN;

if (!MAIN_URL || !MAIN_ANON_KEY) {
  console.error("❌ Faltan variables SUPABASE_URL_MAIN o SUPABASE_ANON_KEY_MAIN en .env");
}

// Cliente normal (anon) — para verificar tokens de usuario
export const supabaseMain = createClient(MAIN_URL, MAIN_ANON_KEY, {
  auth: { persistSession: false },
});

// Cliente admin (service role) — para operaciones privilegiadas sobre la DB
export const supabaseMainAdmin = MAIN_SERVICE_ROLE_KEY
  ? createClient(MAIN_URL, MAIN_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabaseMain;

export const supabaseMainConfigured = !!MAIN_URL && !!MAIN_ANON_KEY;

// ── Proyecto STORAGE (solo imágenes) ────────────────────────────────────
const STORAGE_URL = process.env.SUPABASE_URL_STORAGE;
const STORAGE_ANON_KEY = process.env.SUPABASE_ANON_KEY_STORAGE;
const STORAGE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_STORAGE;

if (!STORAGE_URL || !STORAGE_ANON_KEY) {
  console.warn("⚠️  Faltan variables SUPABASE_URL_STORAGE o SUPABASE_ANON_KEY_STORAGE en .env (Storage deshabilitado)");
}

export const supabaseStorage = STORAGE_URL && STORAGE_ANON_KEY
  ? createClient(STORAGE_URL, STORAGE_ANON_KEY, {
      auth: { persistSession: false },
    })
  : null;

// Cliente admin de Storage — para subir/borrar archivos sin restricciones RLS
export const supabaseStorageAdmin = STORAGE_URL && STORAGE_SERVICE_ROLE_KEY
  ? createClient(STORAGE_URL, STORAGE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabaseStorage;

export const supabaseStorageConfigured = !!STORAGE_URL && !!STORAGE_ANON_KEY;

// ── Retrocompatibilidad ──────────────────────────────────────────────────
// Código antiguo que importaba { supabase, supabaseAdmin, supabaseConfigured }
// sigue funcionando: queda apuntando al proyecto MAIN (auth + db).
export const supabase = supabaseMain;
export const supabaseAdmin = supabaseMainAdmin;
export const supabaseConfigured = supabaseMainConfigured;
