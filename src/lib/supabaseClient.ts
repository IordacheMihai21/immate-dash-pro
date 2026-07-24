import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Lipsesc VITE_SUPABASE_URL sau VITE_SUPABASE_ANON_KEY din .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const DEMO_COMPANY_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_USER_ID = "22222222-2222-2222-2222-222222222222";
