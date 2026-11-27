import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { seedState } from "./seed";
import type { State } from "./model";
import { AppError } from "./domain";
export const appMode = () => {
  const mode = process.env.APP_MODE;
  if (mode && mode !== "demo" && mode !== "supabase")
    throw new AppError("APP_MODE harus demo atau supabase", 503);
  if (process.env.VERCEL && mode !== "supabase")
    throw new AppError(
      "Deploy publik memerlukan Supabase. Akun demo lokal tidak diaktifkan.",
      503,
    );
  return mode === "supabase" ? ("supabase" as const) : ("demo" as const);
};
export function localDb() {
  mkdirSync(path.join(process.cwd(), ".local"), { recursive: true });
  const db = new DatabaseSync(
    path.join(process.cwd(), ".local", "rupa.sqlite"),
  );
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);",
  );
  return db;
}
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new AppError("Konfigurasi Supabase belum lengkap", 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function readState(): Promise<{ state: State; revision: number }> {
  if (appMode() === "supabase") {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("rupa_workspace")
      .select("state,revision")
      .eq("id", 1)
      .single();
    if (error)
      throw new AppError(
        "Database Supabase belum disiapkan. Jalankan supabase/schema.sql dan setup:seed.",
        503,
      );
    return { state: data.state as State, revision: data.revision };
  }
  const db = localDb();
  try {
    let row = db
      .prepare("SELECT state,revision FROM workspace WHERE id=1")
      .get() as { state: string; revision: number } | undefined;
    if (!row) {
      db.prepare("INSERT OR IGNORE INTO workspace VALUES (1,0,?)").run(
        JSON.stringify(seedState()),
      );
      row = db
        .prepare("SELECT state,revision FROM workspace WHERE id=1")
        .get() as { state: string; revision: number };
    }
    return { state: JSON.parse(row.state), revision: row.revision };
  } finally {
    db.close();
  }
}
export async function writeState(state: State, revision: number) {
  if (appMode() === "supabase") {
    const { data, error } = await supabaseAdmin()
      .from("rupa_workspace")
      .update({ state, revision: revision + 1 })
      .eq("id", 1)
      .eq("revision", revision)
      .select("revision");
    if (error) throw new AppError("Gagal menyimpan ke Supabase", 503);
    if (!data?.length)
      throw new AppError(
        "Data baru saja berubah. Muat ulang lalu coba lagi.",
        409,
      );
    return;
  }
  const db = localDb();
  try {
    const r = db
      .prepare(
        "UPDATE workspace SET state=?,revision=revision+1 WHERE id=1 AND revision=?",
      )
      .run(JSON.stringify(state), revision);
    if (!r.changes)
      throw new AppError(
        "Data baru saja berubah. Muat ulang lalu coba lagi.",
        409,
      );
  } finally {
    db.close();
  }
}
