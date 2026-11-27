import { NextRequest } from "next/server";
import { getUser, rateLimit } from "@/lib/auth";
import { readState, writeState, appMode, supabaseAdmin } from "@/lib/store";
import { execute, AppError } from "@/lib/domain";
import { json, failure, safeOrigin } from "@/lib/http";
import { createPayment, settlePayment } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    safeOrigin(req);
    const user = await getUser();
    if (!user) throw new AppError("Silakan masuk terlebih dahulu", 401);
    await rateLimit(`action:${user.id}`);
    if (Number(req.headers.get("content-length") || 0) > 65536)
      throw new AppError("Permintaan terlalu besar", 413);
    const { action, input } = await req.json();
    const { state, revision } = await readState();
    if (appMode() === "supabase") {
      const { data } = await supabaseAdmin()
        .from("rupa_profiles")
        .select("id,name,role,shop_id")
        .in("role", ["tailor", "admin", "merchant"]);
      for (const p of data || []) {
        const u = {
          id: p.id,
          name: p.name,
          role: p.role,
          shopId: p.shop_id || undefined,
          email: "",
        };
        const i = state.users.findIndex((x) => x.id === p.id);
        if (i >= 0) state.users[i] = u;
        else state.users.push(u);
      }
    }
    if (!state.users.some((u) => u.id === user.id)) state.users.push(user);
    let result: unknown;
    if (action === "create_payment") {
      if (typeof input?.orderId !== "string")
        throw new AppError("Pesanan tidak valid");
      result = await createPayment(state, user, input.orderId);
    } else if (action === "simulate_payment") {
      if (appMode() !== "demo")
        throw new AppError("Simulasi lokal tidak aktif", 403);
      const p = state.payments.find((p) => p.id === input?.paymentId);
      const o =
        p &&
        state.orders.find(
          (o) => o.id === p.orderId && o.customerId === user.id,
        );
      if (!p || !o || p.mode !== "simulation")
        throw new AppError("Transaksi tidak ditemukan", 404);
      if (!["pending", "paid"].includes(p.status))
        throw new AppError("Transaksi tidak dapat diselesaikan");
      settlePayment(state, p);
      result = {};
    } else result = execute(state, user, action, input);
    await writeState(state, revision);
    return json({ ok: true, result });
  } catch (e) {
    return failure(e);
  }
}
