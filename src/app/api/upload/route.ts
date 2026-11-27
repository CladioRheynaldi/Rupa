import { NextRequest } from "next/server";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getUser, rateLimit } from "@/lib/auth";
import { readState, writeState, appMode, supabaseAdmin } from "@/lib/store";
import { id, now, AppError } from "@/lib/domain";
import { visibleOrder } from "@/lib/model";
import { json, failure, safeOrigin } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  let diskPath: string | undefined;
  let cloudPath: string | undefined;
  try {
    safeOrigin(req);
    const user = await getUser();
    if (!user) throw new AppError("Silakan masuk", 401);
    await rateLimit(`upload:${user.id}`, 20);
    if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new AppError("Maksimal 10 MB per foto", 413);
    const form = await req.formData();
    const file = form.get("file");
    const orderId = String(form.get("orderId") || "");
    const purpose = String(form.get("purpose") || "garment");
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
      throw new AppError("Pilih foto maksimal 10 MB");
    if (
      ![
        "purchase_evidence",
        "garment",
        "intake",
        "qc",
        "body_optional",
        "reference_catalog",
      ].includes(purpose)
    )
      throw new AppError("Tujuan file tidak valid");
    const { state, revision } = await readState();
    if (
      orderId &&
      !state.orders.some(
        (o) =>
          o.id === orderId && visibleOrder(user, o) && user.role !== "merchant",
      )
    )
      throw new AppError("Pesanan tidak ditemukan", 404);
    if (
      purpose !== "purchase_evidence" &&
      purpose !== "reference_catalog" &&
      !orderId
    )
      throw new AppError("Foto pakaian harus terkait pesanan");
    if (purpose === "reference_catalog" && user.role !== "admin")
      throw new AppError("Hanya admin dapat menambah gambar katalog", 403);
    if (purpose === "purchase_evidence" && user.role !== "customer")
      throw new AppError(
        "Hanya pelanggan dapat mengunggah bukti pembelian",
        403,
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    let image: Buffer;
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels: 25000000,
      }).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
        throw new Error("format");
      image = await sharp(buffer, { limitInputPixels: 25000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(
        "File harus berupa foto JPEG, PNG, atau WebP yang valid",
      );
    }
    const assetId = id();
    const storagePath = `${user.id}/${assetId}.jpg`;
    if (appMode() === "supabase") {
      const { error } = await supabaseAdmin()
        .storage.from("rupa-private")
        .upload(storagePath, image, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (error) throw new AppError("Upload Supabase gagal", 503);
      cloudPath = storagePath;
    } else {
      const dir = path.join(process.cwd(), ".local", "assets");
      await mkdir(dir, { recursive: true });
      diskPath = path.join(dir, `${assetId}.jpg`);
      await writeFile(diskPath, image);
    }
    state.assets.push({
      id: assetId,
      ownerId: user.id,
      orderId: orderId || undefined,
      name: file.name.slice(0, 120),
      mime: "image/jpeg",
      storagePath,
      purpose,
      createdAt: now(),
    });
    await writeState(state, revision);
    return json({ id: assetId, url: `/api/files/${assetId}` });
  } catch (e) {
    if (diskPath) await unlink(diskPath).catch(() => {});
    if (cloudPath)
      await supabaseAdmin().storage.from("rupa-private").remove([cloudPath]);
    return failure(e);
  }
}
