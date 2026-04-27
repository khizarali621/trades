"use client";
import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('🔧 Supabase config:', { 
    hasUrl: !!url, 
    hasKey: !!key,
    urlStart: url?.substring(0, 20) 
  });
  
  if (!url || !key) {
    console.warn('⚠️ Supabase credentials not configured');
    return null;
  }
  
  supabaseClient = createClient(url, key);
  console.log('✅ Supabase client created');
  return supabaseClient;
}

export function isSupabaseConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Alias for convenience
export const supabase = getSupabaseClient;
