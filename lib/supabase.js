import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * ─────────────────────────────────────────────────────────────────────────
 * DOS PROYECTOS DE SUPABASE SEPARADOS:
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

export const supabaseMainConfigured = !!MAIN_URL && !!MAIN_ANON_KEY;

if (!supabaseMainConfigured) {
  console.error("");
  console.error("🛑🛑🛑 FALTAN VARIABLES DE ENTORNO DEL PROYECTO MAIN 🛑🛑🛑");
  console.error("   SUPABASE_URL_MAIN      =", MAIN_URL ? "✅ definida" : "❌ FALTA");
  console.error("   SUPABASE_ANON_KEY_MAIN =", MAIN_ANON_KEY ? "✅ definida" : "❌ FALTA");
  console.error("   Revisa tu archivo .env (local) o las variables de entorno (Render).");
  console.error("");
}

if (supabaseMainConfigured && !MAIN_SERVICE_ROLE_KEY) {
  console.warn("⚠️  Falta SUPABASE_SERVICE_ROLE_KEY_MAIN — usando la anon key como fallback (operaciones de admin pueden fallar por RLS).");
}

// IMPORTANTE: createClient() NUNCA debe recibir undefined, o lanza una
// excepción que tumba TODO el servidor al arrancar (incluso rutas que no
// usan Supabase). Por eso usamos placeholders válidos como fallback.
export const supabaseMain = createClient(
  MAIN_URL || "https://placeholder.supabase.co",
  MAIN_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder",
  { auth: { persistSession: false } }
);

// Cliente admin (service role) — para operaciones privilegiadas sobre la DB
export const supabaseMainAdmin = (MAIN_URL && MAIN_SERVICE_ROLE_KEY)
  ? createClient(MAIN_URL, MAIN_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ── Proyecto STORAGE (solo imágenes) ────────────────────────────────────
const STORAGE_URL = process.env.SUPABASE_URL_STORAGE;
const STORAGE_ANON_KEY = process.env.SUPABASE_ANON_KEY_STORAGE;
const STORAGE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_STORAGE;

export const supabaseStorageConfigured = !!STORAGE_URL && !!STORAGE_ANON_KEY;

if (!supabaseStorageConfigured) {
  console.warn("⚠️  Faltan SUPABASE_URL_STORAGE / SUPABASE_ANON_KEY_STORAGE — Storage de imágenes deshabilitado (el resto de la app funciona igual).");
}

export const supabaseStorage = supabaseStorageConfigured
  ? createClient(STORAGE_URL, STORAGE_ANON_KEY, { auth: { persistSession: false } })
  : null;

export const supabaseStorageAdmin = (supabaseStorageConfigured && STORAGE_SERVICE_ROLE_KEY)
  ? createClient(STORAGE_URL, STORAGE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ── Retrocompatibilidad ──────────────────────────────────────────────────
export const supabase = supabaseMain;
export const supabaseAdmin = supabaseMainAdmin;
export const supabaseConfigured = supabaseMainConfigured;

// ── Resumen visible al arrancar el servidor ─────────────────────────────
console.log("");
console.log("📋 Estado de Supabase:");
console.log("   MAIN (Auth + DB):    ", supabaseMainConfigured ? "✅ configurado" : "❌ NO configurado");
console.log("   STORAGE (imágenes):  ", supabaseStorageConfigured ? "✅ configurado" : "⚠️  no configurado");
console.log("");
