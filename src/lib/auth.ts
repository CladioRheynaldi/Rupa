import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  appMode,
  localDb,
  readState,
  supabaseAdmin,
  writeState,
} from "./store";
import { AppError } from "./domain";
import type { User } from "./model";
export const demoPassword = "RupaDemo2026!";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function matchPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const original = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return original.length === actual.length && timingSafeEqual(original, actual);
}
export async function supabaseSession() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new AppError("Konfigurasi Supabase belum lengkap", 503);
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        values.forEach(({ name, value, options }) =>
          jar.set(name, value, { ...options, httpOnly: true, sameSite: "lax" }),
        );
      },
    },
  });
}
async function realUser() {
  const client = await supabaseSession();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabaseAdmin()
    .from("rupa_profiles")
    .select("id,name,role,shop_id")
    .eq("id", user.id)
    .single();
  if (error || !data)
    throw new AppError("Profil belum tersedia. Hubungi operator.", 403);
  return {
    id: data.id,
    name: data.name,
    email: user.email || "",
    role: data.role,
    shopId: data.shop_id || undefined,
  } as User;
}
export async function getUser(): Promise<User | null> {
  if (appMode() === "supabase") return realUser();
  const jar = await cookies();
  const raw = jar.get("rupa_session")?.value;
  if (!raw) return null;
  const token = createHash("sha256").update(raw).digest("hex");
  const db = localDb();
  let row;
  try {
    row = db
      .prepare("SELECT user_id,expires FROM sessions WHERE token=?")
      .get(token) as { user_id: string; expires: number } | undefined;
  } finally {
    db.close();
  }
  if (!row || row.expires < Date.now()) return null;
  const { state } = await readState();
  return state.users.find((u) => u.id === row.user_id) || null;
}
export async function signIn(email: string, password: string) {
  if (appMode() === "supabase") {
    const c = await supabaseSession();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("Email atau kata sandi tidak sesuai.", 401);
    return;
  }
  const { state } = await readState();
  const db = localDb();
  try {
    for (const u of state.users.filter((u) => u.id.endsWith("_demo")))
      db.prepare("INSERT OR IGNORE INTO accounts VALUES (?,?,?)").run(
        u.id,
        u.email,
        hashPassword(demoPassword),
      );
    const a = db
      .prepare("SELECT id,password FROM accounts WHERE email=?")
      .get(email.toLowerCase()) as { id: string; password: string } | undefined;
    if (!a || !matchPassword(password, a.password))
      throw new AppError("Email atau kata sandi tidak sesuai.", 401);
    const raw = randomBytes(32).toString("hex");
    const token = createHash("sha256").update(raw).digest("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      token,
      a.id,
      Date.now() + 12 * 3600000,
    );
    const jar = await cookies();
    jar.set("rupa_session", raw, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 3600,
      secure: process.env.APP_URL?.startsWith("https:") || false,
    });
  } finally {
    db.close();
  }
}
export async function signOut() {
  if (appMode() === "supabase") {
    await (await supabaseSession()).auth.signOut();
    return;
  }
  const jar = await cookies();
  const raw = jar.get("rupa_session")?.value;
  if (raw) {
    const db = localDb();
    try {
      db.prepare("DELETE FROM sessions WHERE token=?").run(
        createHash("sha256").update(raw).digest("hex"),
      );
    } finally {
      db.close();
    }
  }
  jar.delete("rupa_session");
}
export async function register(name: string, email: string, password: string) {
  if (appMode() === "supabase") {
    const c = await supabaseSession();
    const { error } = await c.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
      },
    });
    if (error)
      throw new AppError(
        "Pendaftaran belum dapat diproses. Periksa email dan kata sandi.",
      );
    return { message: "Periksa email untuk verifikasi akun." };
  }
  const { state, revision } = await readState();
  if (state.users.some((u) => u.email === email))
    throw new AppError(
      "Email belum dapat digunakan. Coba masuk atau gunakan email lain.",
    );
  const user: User = {
    id: randomBytes(16).toString("hex"),
    name,
    email,
    role: "customer",
  };
  state.users.push(user);
  await writeState(state, revision);
  const db = localDb();
  try {
    db.prepare("INSERT INTO accounts VALUES (?,?,?)").run(
      user.id,
      email,
      hashPassword(password),
    );
  } finally {
    db.close();
  }
  return {
    message:
      "Akun pelanggan demo dibuat. Tidak ada email yang dikirim; silakan masuk.",
  };
}
export async function rateLimit(key: string, max = 80, window = 60000) {
  if (appMode() === "supabase") {
    const { data, error } = await supabaseAdmin().rpc("rupa_check_limit", {
      p_key: key,
      p_max: max,
      p_window_ms: window,
    });
    if (error) throw new AppError("Pemeriksaan batas penggunaan gagal", 503);
    if (!data)
      throw new AppError("Terlalu banyak permintaan. Coba lagi sebentar.", 429);
    return;
  }
  const db = localDb();
  try {
    db.exec("BEGIN IMMEDIATE");
    const row = db
      .prepare("SELECT count,reset_at FROM limits WHERE key=?")
      .get(key) as { count: number; reset_at: number } | undefined;
    if (!row || row.reset_at < Date.now())
      db.prepare(
        "INSERT INTO limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at",
      ).run(key, 1, Date.now() + window);
    else {
      if (row.count >= max)
        throw new AppError(
          "Terlalu banyak permintaan. Coba lagi sebentar.",
          429,
        );
      db.prepare("UPDATE limits SET count=count+1 WHERE key=?").run(key);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.close();
  }
}
