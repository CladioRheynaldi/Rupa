import { createHash, timingSafeEqual } from "node:crypto";
import { activeQuote, type State, type User, type Payment } from "./model";
import { AppError, id, now, record } from "./domain";
import { appMode } from "./store";
export async function createPayment(state: State, user: User, orderId: string) {
  const o = state.orders.find(
    (o) => o.id === orderId && o.customerId === user.id,
  );
  if (!o || user.role !== "customer")
    throw new AppError("Pesanan tidak ditemukan", 404);
  const q = activeQuote(o);
  if (
    o.status !== "awaiting_payment" ||
    q?.status !== "accepted" ||
    q.specVersion !== o.specVersion ||
    Date.parse(q.expiresAt) < Date.now()
  )
    throw new AppError(
      "Diperlukan penawaran aktif yang disetujui dan belum kedaluwarsa",
    );
  const existing = state.payments.find(
    (p) => p.quoteId === q.id && ["pending", "paid"].includes(p.status),
  );
  if (existing) return existing;
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key && appMode() !== "demo")
    throw new AppError("Midtrans Sandbox belum dikonfigurasi", 503);
  const p: Payment = {
    id: id(),
    orderId: o.id,
    quoteId: q.id,
    providerOrderId: `RUPA-${id()}`,
    amount: q.total,
    status: "pending",
    mode: key ? "midtrans_sandbox" : "simulation",
    createdAt: now(),
  };
  if (key) {
    const r = await fetch(
      "https://app.sandbox.midtrans.com/snap/v1/transactions",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: p.providerOrderId,
            gross_amount: p.amount,
          },
          customer_details: { first_name: user.name, email: user.email },
          callbacks: { finish: `${process.env.APP_URL}/orders/${o.id}` },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    const data = await r.json();
    if (!r.ok || !data.token)
      throw new AppError("Midtrans Sandbox belum dapat membuat transaksi", 502);
    p.token = data.token;
    p.redirectUrl = data.redirect_url;
  }
  state.payments.push(p);
  record(state, user, "create_payment", o.id, `${p.mode}: ${p.amount}`);
  return p;
}
export function settlePayment(state: State, p: Payment) {
  if (p.status === "paid") return;
  const o = state.orders.find((o) => o.id === p.orderId);
  const q = o && activeQuote(o);
  p.status = "paid";
  if (!o) return;
  if (
    !q ||
    q.id !== p.quoteId ||
    q.status !== "accepted" ||
    q.total !== p.amount ||
    q.specVersion !== o.specVersion ||
    o.status !== "awaiting_payment"
  ) {
    o.status = "on_hold";
    o.events.push({
      id: id(),
      label: "Pembayaran perlu rekonsiliasi operator",
      actor: "Sistem",
      at: now(),
    });
    return;
  }
  o.status = "ready_for_work";
  o.events.push({
    id: id(),
    label:
      p.mode === "simulation"
        ? "Simulasi pembayaran lokal berhasil — tidak ada uang berpindah"
        : "Pembayaran Midtrans Sandbox terverifikasi",
    actor: "Sistem",
    at: now(),
  });
}
export function verifySignature(body: Record<string, unknown>, key: string) {
  const given = body.signature_key;
  if (typeof given !== "string" || !/^[a-f0-9]{128}$/i.test(given))
    return false;
  const expected = createHash("sha512")
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${key}`)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(given.toLowerCase()),
    Buffer.from(expected),
  );
}
