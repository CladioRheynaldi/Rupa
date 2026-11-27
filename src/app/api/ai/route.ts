import { NextRequest, after } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getUser, rateLimit } from "@/lib/auth";
import { readState, writeState, appMode, supabaseAdmin } from "@/lib/store";
import { AppError, id, now } from "@/lib/domain";
import { json, failure, safeOrigin } from "@/lib/http";
import { previewFailure } from "@/lib/preview-errors";
import { randomInt } from "node:crypto";
import { generateVariants } from "@/lib/design-variants";
import { dailyAILimit, indexAIRequests, replaceDesignJob } from "@/lib/ai-jobs";
import { designMarkupSchema } from "@/lib/design-markup";
import {normalizePocketDetails} from "@/lib/pocket-design";
export const runtime = "nodejs";
export const maxDuration = 900;
async function setJob(jobId: string, patch: Record<string, unknown>) {
  for (let n = 0; n < 5; n++) {
    const { state, revision } = await readState();
    const j = state.jobs.find((j) => j.id === jobId);
    if (!j) return;
    Object.assign(j, patch);
    const o = state.orders.find((o) => o.id === j.orderId);
    if (o && j.specVersion !== o.specVersion && patch.status === "succeeded")
      j.status = "stale";
    try {
      await writeState(state, revision);
      return;
    } catch (e) {
      if (!(e instanceof AppError && e.status === 409) || n === 4) throw e;
    }
  }
}
async function storePreview(job: { id: string; ownerId: string; orderId: string }, result: { image?: unknown; preservation?: unknown }) {
      if (typeof result.image !== "string" || result.image.length > 16000000)
        throw new Error("Pratinjau tidak valid");
      const sharp = (await import("sharp")).default;
      const lossless = result.preservation === "outside-selection";
      const decoder = sharp(Buffer.from(result.image, "base64"), {
        limitInputPixels: 25000000,
      });
      const imageBytes = await (lossless ? decoder.png() : decoder.jpeg({ quality: 85 })).toBuffer();
      if (!(await readState()).state.jobs.some(j=>j.id === job.id)) throw new Error("Permintaan telah digantikan");
      const assetId = id(),
        storagePath = `${job.ownerId}/${assetId}.${lossless ? "png" : "jpg"}`;
      if (appMode() === "supabase") {
        const { error } = await supabaseAdmin()
          .storage.from("rupa-private")
          .upload(storagePath, imageBytes, { contentType: lossless ? "image/png" : "image/jpeg" });
        if (error) throw new Error("Gagal menyimpan pratinjau");
      } else {
        const fs = await import("node:fs/promises");
        await fs.mkdir(path.join(process.cwd(), ".local", "assets"), {
          recursive: true,
        });
        await fs.writeFile(
          path.join(process.cwd(), ".local", "assets", `${assetId}.jpg`),
          imageBytes,
        );
      }
      for (let n = 0; n < 5; n++) {
        const { state: s, revision } = await readState();
        if (!s.jobs.some(j=>j.id === job.id)) throw new Error("Permintaan telah digantikan");
        s.assets.push({
          id: assetId,
          ownerId: job.ownerId,
          orderId: job.orderId,
          name: "Pratinjau ilustratif",
          mime: lossless ? "image/png" : "image/jpeg",
          storagePath,
          purpose: "preview",
          createdAt: now(),
        });
        try {
          await writeState(s, revision);
          break;
        } catch (e) {
          if (n === 4) throw e;
        }
      }
      return assetId;
}
async function run(jobId: string) {
  try {
    await setJob(jobId, { status: "running" });
    const { state } = await readState();
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const order = state.orders.find((o) => o.id === job.orderId)!;
    const original = job.assetId
      ? state.assets.find((a) => a.id === job.assetId)
      : null;
    let image: string | undefined;
    if (original) {
      let buf: Buffer;
      if (appMode() === "supabase") {
        const { data, error } = await supabaseAdmin()
          .storage.from("rupa-private")
          .download(original.storagePath);
        if (error || !data) throw new Error("Foto tidak tersedia");
        buf = Buffer.from(await data.arrayBuffer());
      } else
        buf = await readFile(
          path.join(process.cwd(), ".local", "assets", `${original.id}.jpg`),
        );
      image = buf.toString("base64");
    }
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_WORKER_TOKEN}` };
    if (job.mode === "measurements") {
      const response = await fetch(new URL("/analyze", process.env.AI_WORKER_URL!), {
        method: "POST", headers, body: JSON.stringify({ prompt: job.prompt, image, changes: order.changes, mode: job.mode }),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) throw new Error("Saran ukuran belum tersedia. Lanjutkan konsultasi dengan penjahit.");
      const result = await response.json();
      await setJob(jobId, { status: "succeeded", result: String(result.text || ""), model: result.model });
      return;
    }
    let model: string | undefined, editInstruction: string | undefined, failureMessage: string | undefined;
    const count = job.variationCount || 3;
    const started = Date.now();
    const { variants, failures } = await generateVariants(count, randomInt(2147483648), async (seed, index) => {
      if (!(await readState()).state.jobs.some(j => j.id === jobId)) throw new Error("Permintaan telah digantikan");
      if (Date.now() - started > 780000) throw new Error("Batas waktu pemrosesan tercapai");
      await setJob(jobId, { result: `Sedang membuat ilustrasi ${index + 1} dari ${count}. Setiap variasi menggunakan seed berbeda.` });
      const response = await fetch(new URL("/preview", process.env.AI_WORKER_URL!), {
        method: "POST", headers,
        body: JSON.stringify({ prompt: job.prompt, image, mode: "preview", markup: job.markup, region: job.region, engine: "sdxl", generation: job.generation, seed, variation_index: index }),
        signal: AbortSignal.timeout(Math.min(600000, Math.max(1000, 840000 - (Date.now() - started)))),
      });
      if (!response.ok) {
        failureMessage = previewFailure(response.status, await response.json().catch(() => null));
        throw new Error(failureMessage);
      }
      const visual = await response.json();
      const assetId = await storePreview(job, visual);
      model = typeof visual.model === "string" ? visual.model : undefined;
      editInstruction = visual.edit_instruction;
      return { assetId, seed, label: typeof visual.variant_label === "string" ? visual.variant_label.slice(0,100) : undefined, instruction: typeof visual.edit_instruction === "string" ? visual.edit_instruction.slice(0,4000) : undefined };
    }, async (variants, attempted) => {
      await setJob(jobId, { variants, ...(variants.length ? { assetId: variants[0].assetId } : {}), result: `${variants.length} ilustrasi tersedia; ${attempted} dari ${count} percobaan selesai.` });
    });
    if (!variants.length) throw new Error(failureMessage || "Seluruh ilustrasi gagal dibuat. Coba lagi atau konsultasikan dengan penjahit.");
    await setJob(jobId, {
      status: "succeeded", variants, assetId: variants[0].assetId, seed: variants[0].seed, model, editInstruction,
      previewError: undefined,
      result: `${variants.length} ilustrasi dibuat dengan ${model?.includes("sketch-guided hybrid") ? "sketsa tata letak + SDXL (hibrida)" : model?.includes("ControlNet disabled") ? "SDXL Inpainting" : "SDXL + ControlNet"}. Pilih satu untuk konsultasi. ${variants.some(v=>v.label)?"Pilihan saku mengeksplorasi model terbuka, penutup, dan lipit tengah, dengan warna serta posisi yang sama.":"Variasi mengikuti instruksi yang sama; perbedaannya tidak selalu besar."} Hasil bukan jaminan hasil jahitan atau ukuran.${failures ? ` ${failures} variasi gagal dibuat; hasil lainnya tetap dapat dipilih.` : ""}`,
    });
  } catch (e) {
    await setJob(jobId, {
      status: "failed",
      error: e instanceof Error ? e.message : "Pemrosesan gagal",
    });
  }
}
export async function POST(req: NextRequest) {
  try {
    safeOrigin(req);
    const user = await getUser();
    if (!user || user.role !== "customer")
      throw new AppError("Gunakan akun pelanggan", 403);
    await rateLimit(`ai:${user.id}`, 5, 60000);
    const parsed = z
      .object({
        orderId: z.string(),
        mode: z.enum(["design", "measurements", "preview"]),
        prompt: z.string().trim().min(5).max(4000),
        assetId: z.string().optional(),
        markup: designMarkupSchema.optional(),
        engine: z.enum(["diffusion","sdxl"]).default("diffusion"),
        variationCount: z.number().int().min(1).max(3).default(3),
        generation: z.enum(["inpaint","text"]).default("inpaint"),
        region: z.object({ x: z.number().min(0).max(0.98), y: z.number().min(0).max(0.98),
          width: z.number().min(0.02).max(1), height: z.number().min(0.02).max(1) })
          .refine(r => r.x+r.width <= 1.000001 && r.y+r.height <= 1.000001, "Area harus berada di dalam foto").optional(),
      })
      .safeParse(await req.json());
    if (!parsed.success)
      throw new AppError("Lengkapi ide perubahan minimal lima karakter");
    const p = parsed.data;
    if(p.markup)p.markup=normalizePocketDetails(p.markup);
    if(p.mode === "preview" && p.engine !== "sdxl")throw new AppError("Gunakan SDXL untuk membuat konsep gambar");
    if (p.mode !== "measurements") {
      p.engine = "sdxl";
      const details = p.markup?.details;
      if (details?.length) {
        for (const [i,d] of details.entries()) {
          if (d.text.trim().length < 5)
            throw new AppError(`Lengkapi deskripsi untuk detail ${i+1}`);
        }
        p.prompt = details.map((d,i)=>`${i+1}. ${d.text.trim()}`).join("\n");
      }
    }
    if (p.engine === "sdxl" && p.generation === "inpaint") {
      if(!p.markup || p.mode === "measurements") throw new AppError("Unggah foto dan tandai area desain sebelum membuat pratinjau");
      for(const [i,d] of (p.markup.details || []).entries()) {
        if(d.pocket){if(!d.pocket.confirmed)throw new AppError(`Konfirmasi posisi dan ukuran visual saku pada detail ${i+1}`);}
        else if(!p.markup.strokes.some(s=>s.tool === "draw" && s.detailId === d.id))throw new AppError(`Coret area untuk detail ${i+1}`);
      }
      if(!p.markup.details?.length&&!p.markup.strokes.some(s=>s.tool==="draw"))throw new AppError("Tandai area perubahan terlebih dahulu");
    }
    const { state, revision } = await readState();
    const o = state.orders.find(
      (o) => o.id === p.orderId && o.customerId === user.id,
    );
    if (!o || !["draft", "consultation"].includes(o.status))
      throw new AppError("Pesanan tidak dapat dianalisis pada tahap ini");
    if (
      p.assetId &&
      !state.assets.some(
        (a) =>
          a.id === p.assetId && a.ownerId === user.id && a.orderId === o.id && a.purpose === "garment",
      )
    )
      throw new AppError("Foto tidak sesuai", 403);
    if (["design", "preview"].includes(p.mode) && !p.assetId && !(p.engine === "sdxl" && p.generation === "text" && p.mode === "preview"))
      throw new AppError("Unggah foto pakaian untuk pratinjau");
    indexAIRequests(state);
    const dailyLimit=dailyAILimit(appMode() === "demo",process.env.AI_DEMO_DAILY_LIMIT);
    if (
      state.audit.filter(a=>a.action === "request_ai" && a.actor === user.id && a.at.slice(0,10) === now().slice(0,10)).length >= dailyLimit
    )
      throw new AppError(
        `Kuota ${dailyLimit} permintaan AI per hari telah tercapai`,
        429,
      );
    const configured = !!(
      process.env.AI_WORKER_URL && process.env.AI_WORKER_TOKEN
    );
    const job = {
      id: id(),
      orderId: o.id,
      ownerId: user.id,
      mode: p.mode,
      prompt: p.prompt,
      assetId: p.assetId,
      baseAssetId: p.assetId,
      region: p.region,
      markup: p.markup,
      engine: p.engine,
      generation: p.generation,
      variationCount: p.mode === "measurements" ? undefined : p.variationCount,
      specVersion: o.specVersion,
      status: configured ? ("queued" as const) : ("failed" as const),
      error: configured
        ? undefined
        : "Pendamping AI belum tersedia. Gunakan form perubahan atau konsultasi; tidak ada analisis AI yang dijalankan.",
      createdAt: now(),
    };
    replaceDesignJob(state, job);
    await writeState(state, revision);
    if (configured) after(() => run(job.id));
    return json({ id: job.id, configured });
  } catch (e) {
    return failure(e);
  }
}
