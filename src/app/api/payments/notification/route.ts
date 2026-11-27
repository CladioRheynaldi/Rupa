import { NextRequest } from "next/server";
import { readState, writeState } from "@/lib/store";
import { verifySignature, settlePayment } from "@/lib/payments";
import { json, failure } from "@/lib/http";
import { AppError } from "@/lib/domain";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const key = process.env.MIDTRANS_SERVER_KEY;
    if (!key) throw new AppError("Midtrans belum dikonfigurasi", 503);
    const body = await req.json();
    if (!verifySignature(body, key))
      throw new AppError("Signature tidak valid", 403);
    const remote = await fetch(
      `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(String(body.order_id))}/status`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!remote.ok)
      throw new AppError("Rekonsiliasi provider belum tersedia", 503);
    const status = await remote.json();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { state, revision } = await readState();
      const p = state.payments.find(
        (p) =>
          p.providerOrderId === body.order_id && p.mode === "midtrans_sandbox",
      );
      if (
        !p ||
        Number(status.gross_amount) !== p.amount ||
        status.order_id !== p.providerOrderId
      )
        throw new AppError("Nominal atau transaksi tidak sesuai", 400);
      if (
        status.transaction_status === "settlement" ||
        (status.transaction_status === "capture" &&
          status.fraud_status === "accept")
      )
        settlePayment(state, p);
      else if (
        ["refund", "partial_refund"].includes(status.transaction_status)
      ) {
        if (status.transaction_status === "refund") p.status = "refunded";
        const o = state.orders.find((o) => o.id === p.orderId);
        if (o) o.status = "on_hold";
      } else if (p.status !== "paid" && p.status !== "refunded") {
        if (status.transaction_status === "expire") p.status = "expired";
        else if (
          ["deny", "cancel", "failure"].includes(status.transaction_status)
        )
          p.status = "failed";
      }
      try {
        await writeState(state, revision);
        return json({ received: true });
      } catch (e) {
        if (!(e instanceof AppError && e.status === 409) || attempt === 2)
          throw e;
      }
    }
    throw new AppError("Coba kirim ulang notifikasi", 503);
  } catch (e) {
    return failure(e);
  }
}
