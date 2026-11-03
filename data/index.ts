import { isSupabaseConfigured } from "../config";
import type { Backend } from "./backend";
import { demoBackend } from "./demo-backend";
import { supabaseBackend } from "./supabase-backend";

/** Backend ativo: Supabase quando configurado; caso contrário, demonstração local. */
export const backend: Backend = isSupabaseConfigured ? supabaseBackend : demoBackend;
export const isDemo = backend.mode === "demo";

export type { Backend } from "./backend";
export * from "./types";
export { friendlyError, AppError } from "./errors";
