import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    const error = new Error(
      "Supabase is not configured. Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env."
    );
    error.statusCode = 500;
    throw error;
  }

  return supabase;
}
