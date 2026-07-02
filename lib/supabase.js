import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Proyecto MAIN (Auth + DB)
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

export const supabaseMain = createClient(
  MAIN_URL || "https://placeholder.supabase.co",
  MAIN_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder",
  { auth: { persistSession: false } }
);

export const supabaseMainAdmin = (MAIN_URL && MAIN_SERVICE_ROLE_KEY)
  ? createClient(MAIN_URL, MAIN_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const supabase = supabaseMain;
export const supabaseAdmin = supabaseMainAdmin;
export const supabaseConfigured = supabaseMainConfigured;

console.log("");
console.log("📋 Estado de Supabase:");
console.log("   MAIN (Auth + DB):    ", supabaseMainConfigured ? "✅ configurado" : "❌ NO configurado");
console.log("");
