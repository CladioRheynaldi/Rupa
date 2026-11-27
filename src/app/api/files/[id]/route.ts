import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { readState, appMode, supabaseAdmin } from "@/lib/store";
import { canReadAsset, AppError } from "@/lib/domain";
import { failure } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const user = await getUser();
    if (!user) throw new AppError("Silakan masuk", 401);
    const { state } = await readState();
    const a = state.assets.find((a) => a.id === id);
    if (!a || !canReadAsset(state, user, a))
      throw new AppError("File tidak ditemukan", 404);
    let data: Buffer;
    if (appMode() === "supabase") {
      const { data: file, error } = await supabaseAdmin()
        .storage.from("rupa-private")
        .download(a.storagePath);
      if (error || !file) throw new AppError("File tidak tersedia", 404);
      data = Buffer.from(await file.arrayBuffer());
    } else {
      if (!/^[a-f0-9-]+$/.test(a.id))
        throw new AppError("File tidak valid", 404);
      data = await readFile(
        path.join(process.cwd(), ".local", "assets", `${a.id}.jpg`),
      );
    }
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": ["image/jpeg","image/png","image/webp"].includes(a.mime) ? a.mime : "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
