import { NextRequest, NextResponse } from "next/server";
import { AppError } from "./domain";
export function safeOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = new URL(req.url);
  if (
    !origin ||
    new URL(origin).host !== (req.headers.get("host") || expected.host)
  )
    throw new AppError("Asal permintaan tidak sesuai", 403);
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function failure(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  console.error(
    "Rupa server error",
    e instanceof Error ? e.message : "unknown",
  );
  return json({ error: "Terjadi kendala. Muat ulang dan coba kembali." }, 500);
}
