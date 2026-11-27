import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { seedState } from "../src/lib/seed";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.",
    );
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c
    .from("rupa_workspace")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error("Schema is not ready: " + error.message);
  if (data)
    throw new Error(
      "Workspace already exists. Refusing to overwrite any user data.",
    );
  const state = seedState();
  state.users = [];
  const { error: insertError } = await c
    .from("rupa_workspace")
    .insert({ id: 1, revision: 0, state });
  if (insertError) throw insertError;
  console.log(
    "Supabase prototype workspace initialized with fictional catalog only. No demo privileged users were created.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
