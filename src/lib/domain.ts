import { randomUUID } from "node:crypto";
import { z } from "zod";
import { effectiveCatalog } from "./catalog";
import { designMarkupSchema } from "./design-markup";
import {normalizePocketDetails} from "./pocket-design";
import {
  activeQuote,
  visibleOrder,
  type State,
  type User,
  type Order,
  type OrderStatus,
  type Asset,
} from "./model";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(message, status);
}
const text = z.string().trim().min(1).max(3000);
const identifier = z.string().min(1).max(100);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new AppError(r.error.issues[0]?.message || "Data tidak valid");
  return r.data;
}
function owned(state: State, user: User, orderId: string) {
  const o = state.orders.find((o) => o.id === orderId);
  assert(o && visibleOrder(user, o), "Pesanan tidak ditemukan", 404);
  return o;
}
function customer(user: User, order: Order) {
  assert(
    user.role === "customer" && order.customerId === user.id,
    "Hanya pelanggan pemilik pesanan",
    403,
  );
}
function operator(user: User) {
  assert(user.role === "admin", "Tindakan hanya untuk operator", 403);
}
function worker(user: User, order: Order) {
  assert(
    user.role === "admin" ||
      (user.role === "tailor" && order.tailorId === user.id),
    "Tidak memiliki penugasan",
    403,
  );
}
export function record(
  state: State,
  user: User,
  action: string,
  target: string,
  detail: string,
) {
  state.audit.push({
    id: id(),
    actor: user.id,
    action,
    target,
    detail,
    at: now(),
  });
}
function event(order: Order, user: User, label: string) {
  order.events.push({ id: id(), label, at: now(), actor: user.name });
}
function asset(state: State, user: User, assetId: string, orderId?: string) {
  const a = state.assets.find((a) => a.id === assetId);
  assert(
    a &&
      (a.ownerId === user.id || user.role === "admin") &&
      (!orderId || a.orderId === orderId),
    "Lampiran tidak valid",
    403,
  );
  return a;
}
const editable = ["draft", "consultation"];
export function execute(
  state: State,
  user: User,
  action: string,
  input: unknown,
): unknown {
  switch (action) {
    case "save_design_markup": {
      const p = parse(z.object({orderId:identifier,assetId:identifier,markup:designMarkupSchema}),input);
      const o = owned(state,user,p.orderId);
      customer(user,o);
      assert(editable.includes(o.status),"Penanda sudah dikunci untuk pemeriksaan/pengerjaan");
      const photo = asset(state,user,p.assetId,o.id);
      assert(photo.purpose === "garment","Gunakan foto pakaian awal");
      o.designMarkup = {assetId:p.assetId,markup:normalizePocketDetails(p.markup),updatedAt:now()};
      record(state,user,action,o.id,"Penanda visual untuk konsultasi diperbarui; belum menjadi instruksi jahit");
      return {};
    }
    case "select_ai_design": {
      const p = parse(z.object({ orderId: identifier, jobId: identifier, referenceId: identifier }), input);
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(editable.includes(o.status), "Pilihan desain sudah dikunci");
      const job = state.jobs.find(j => j.id === p.jobId && j.orderId === o.id && j.ownerId === user.id);
      assert(job && ["succeeded", "stale"].includes(job.status), "Hasil desain belum tersedia");
      const reference = job.references?.find(r => r.id === p.referenceId);
      const variant = job.variants?.find(v => `generated:${v.assetId}` === p.referenceId);
      if (variant) assert(state.assets.some(a => a.id === variant.assetId && a.ownerId === user.id && a.orderId === o.id && a.purpose === "preview"), "Gambar tidak sesuai");
      const generated = p.referenceId === "generated" && job.assetId && job.assetId !== job.baseAssetId && ["design", "preview"].includes(job.mode);
      assert(reference || generated || variant, "Pilihan gambar tidak tersedia");
      state.jobs.filter(j => j.orderId === o.id).forEach(j => { delete j.selectedReferenceId; });
      job.selectedReferenceId = p.referenceId;
      if (variant) job.assetId = variant.assetId;
      const name = reference?.name || "Pratinjau hasil AI";
      const image = reference?.image || `/api/files/${job.assetId}`;
      state.messages.push({ id: id(), orderId: o.id, senderId: user.id, senderName: user.name, role: user.role,
        body: `Pilihan referensi desain: ${name}\nPermintaan: ${job.prompt}\nGambar: ${image}\nUntuk konsultasi; detail pengerjaan dan kelayakan masih perlu disepakati.`, createdAt: now() });
      record(state, user, action, o.id, `${job.id}: ${p.referenceId}`);
      return {};
    }
    case "add_reference": {
      operator(user);
      const p = parse(
        z.object({
          assetId: identifier,
          name: z.string().trim().min(3).max(200),
          attributes: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
          source: z.string().trim().min(5).max(500),
          rightsConfirmed: z.literal(true),
        }),
        input,
      );
      const photo = asset(state, user, p.assetId);
      assert(
        photo.purpose === "reference_catalog",
        "Gunakan unggahan khusus katalog, bukan foto pelanggan",
      );
      const reference = {
        id: id(),
        name: p.name,
        image: `/api/files/${photo.id}`,
        attributes: p.attributes,
        source: p.source,
        kind: "photo" as const,
      };
      state.referenceDesigns ??= [];
      assert(
        effectiveCatalog(state.referenceDesigns).length < 100,
        "Katalog prototipe maksimal 100 referensi",
      );
      state.referenceDesigns.push(reference);
      record(
        state,
        user,
        action,
        reference.id,
        "Referensi berizin ditambahkan ke katalog layanan",
      );
      return { id: reference.id };
    }
    case "verify_purchase": {
      assert(user.role === "customer", "Gunakan akun pelanggan", 403);
      const p = parse(
        z.object({
          shopId: identifier,
          productId: identifier,
          reference: z.string().trim().min(4).max(100),
          channel: z.enum(["Shopee", "Tokopedia", "TikTok Shop", "Lainnya"]),
          evidence: identifier,
        }),
        input,
      );
      const s = state.shops.find((s) => s.id === p.shopId);
      assert(s?.active && s.approved, "Toko belum memiliki kerja sama aktif");
      assert(
        state.products.some(
          (x) => x.id === p.productId && x.shopId === p.shopId,
        ),
        "Produk bukan milik toko ini",
      );
      asset(state, user, p.evidence);
      assert(
        !state.verifications.some(
          (v) =>
            v.customerId === user.id &&
            v.shopId === p.shopId &&
            v.channel === p.channel &&
            v.reference === p.reference &&
            v.productId === p.productId &&
            v.status !== "rejected",
        ),
        "Pengajuan item ini sudah ada",
      );
      const v = {
        ...p,
        id: id(),
        customerId: user.id,
        status: "pending" as const,
        reason: "",
        createdAt: now(),
      };
      state.verifications.push(v);
      record(state, user, action, v.id, "Pengajuan dengan bukti minimum");
      return { id: v.id };
    }
    case "review_purchase": {
      const p = parse(
        z.object({
          id: identifier,
          status: z.enum(["verified", "rejected", "needs_info"]),
          reason: text,
        }),
        input,
      );
      const v = state.verifications.find((v) => v.id === p.id);
      assert(
        v &&
          (user.role === "admin" ||
            (user.role === "merchant" && user.shopId === v.shopId)),
        "Pengajuan tidak ditemukan",
        404,
      );
      assert(v.status !== "verified", "Pembelian sudah diverifikasi");
      if (p.status === "verified")
        assert(
          !state.verifications.some(
            (x) =>
              x.id !== v.id &&
              x.status === "verified" &&
              x.shopId === v.shopId &&
              x.channel === v.channel &&
              x.reference.toLowerCase() === v.reference.toLowerCase() &&
              x.productId === v.productId,
          ),
          "Item pembelian ini sudah terverifikasi. Hubungi operator jika ada unit lain dengan SKU yang sama.",
        );
      v.status = p.status;
      v.reason = p.reason;
      record(state, user, action, v.id, p.reason);
      return {};
    }
    case "create_order": {
      const p = parse(z.object({ verificationId: identifier }), input);
      const v = state.verifications.find((v) => v.id === p.verificationId);
      assert(
        user.role === "customer" &&
          v?.customerId === user.id &&
          v.status === "verified",
        "Pembelian harus diverifikasi terlebih dahulu",
        403,
      );
      assert(
        state.shops.find((s) => s.id === v.shopId)?.active,
        "Toko tidak menerima pengajuan baru",
      );
      assert(
        !state.orders.some(
          (o) => o.verificationId === v.id && o.status !== "cancelled",
        ),
        "Pakaian ini sudah memiliki pesanan jasa",
      );
      const assignedTailor=state.shops.find(s=>s.id===v.shopId)?.tailorId;
      assert(assignedTailor&&state.users.some(u=>u.id===assignedTailor&&u.role==='tailor'),"Admin perlu menetapkan penjahit toko sebelum pesanan jasa dibuat");
      const order: Order = {
        id: id(),
        customerId: user.id,
        shopId: v.shopId,
        productId: v.productId,
        verificationId: v.id,
        status: "draft",
        tailorId: assignedTailor,
        changes: [],
        specVersion: 1,
        quotes: [],
        events: [],
        createdAt: now(),
      };
      event(order, user, "Pesanan dibuat dari pembelian terverifikasi");
      state.orders.push(order);
      record(state, user, action, order.id, "Satu pakaian, beberapa perubahan");
      return { id: order.id };
    }
    case "save_change": {
      const p = parse(
        z.object({
          orderId: identifier,
          id: identifier.optional(),
          serviceId: identifier,
          description: text,
          position: z.string().trim().min(2).max(200),
          quantity: z.number().int().min(1).max(10),
          mode: z.enum(["design", "measurements", "preview"]),
          measurements: z
            .record(z.string(), z.number().min(0.1).max(500))
            .default({}),
        }),
        input,
      );
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(
        editable.includes(o.status),
        "Perubahan sudah dikunci untuk pemeriksaan/penawaran",
      );
      const s = state.services.find((s) => s.id === p.serviceId);
      assert(
        s && !["bespoke", "formal", "mending", "shoulder"].includes(s.id),
        "Layanan ini berada di luar pengerjaan awal",
      );
      if (p.mode === "measurements" && s.measurements)
        assert(
          s.measurements.every((k) => p.measurements[k] > 0),
          "Lengkapi ukuran pakaian dalam cm sesuai panduan",
        );
      const c = {
        id: p.id || id(),
        serviceId: p.serviceId,
        description: p.description,
        position: p.position,
        quantity: p.quantity,
        mode: p.mode,
        measurements: p.measurements,
      };
      if (p.id) {
        const i = o.changes.findIndex((c) => c.id === p.id);
        assert(i >= 0, "Item tidak ditemukan");
        o.changes[i] = c;
      } else {
        assert(o.changes.length < 10, "Maksimal 10 perubahan per pakaian");
        assert(
          !o.changes.some(
            (x) =>
              x.serviceId === c.serviceId &&
              x.position.trim().toLowerCase() ===
                c.position.trim().toLowerCase() &&
              x.description.trim().toLowerCase() ===
                c.description.trim().toLowerCase(),
          ),
          "Perubahan yang sama sudah ada. Gunakan Edit untuk mengubah jumlah atau detailnya.",
        );
        o.changes.push(c);
      }
      o.specVersion++;
      o.status = "consultation";
      state.jobs
        .filter(
          (j) =>
            j.orderId === o.id &&
            j.specVersion !== o.specVersion &&
            j.status === "succeeded",
        )
        .forEach((j) => (j.status = "stale"));
      record(state, user, action, o.id, "Spesifikasi perubahan diperbarui");
      return {};
    }
    case "remove_change": {
      const p = parse(z.object({ orderId: identifier, id: identifier }), input);
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(editable.includes(o.status), "Spesifikasi terkunci");
      o.changes = o.changes.filter((c) => c.id !== p.id);
      o.specVersion++;
      return {};
    }
    case "send_message": {
      const p = parse(z.object({ orderId: identifier, body: text }), input);
      const o = owned(state, user, p.orderId);
      assert(
        user.role !== "merchant",
        "Chat pribadi hanya untuk pelanggan, penjahit, dan operator",
        403,
      );
      state.messages.push({
        id: id(),
        orderId: o.id,
        senderId: user.id,
        senderName: user.name,
        role: user.role,
        body: p.body,
        createdAt: now(),
      });
      return {};
    }
    case "authorize_intake": {
      const p = parse(
        z.object({ orderId: identifier, consent: z.literal(true) }),
        input,
      );
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(
        editable.includes(o.status) && o.changes.length,
        "Tambahkan perubahan terlebih dahulu",
      );
      assert(o.tailorId, "Operator harus menugaskan penjahit terlebih dahulu");
      o.shippingConsent = now();
      o.status = "awaiting_intake";
      event(
        o,
        user,
        "Izin pemeriksaan disetujui. Belum ada izin pemotongan. Pengiriman fisik hanya simulasi pada demo.",
      );
      return {};
    }
    case "assign_tailor": {
      operator(user);
      const p = parse(
        z.object({ orderId: identifier, tailorId: identifier }),
        input,
      );
      const o = owned(state, user, p.orderId);
      assert(
        !["in_progress", "qc", "shipped", "completed"].includes(o.status),
        "Penugasan tidak dapat diubah pada tahap ini",
      );
      assert(
        state.users.some((u) => u.id === p.tailorId && u.role === "tailor"),
        "Penjahit tidak ditemukan",
      );
      assert(state.shops.find(s=>s.id===o.shopId)?.tailorId===p.tailorId,"Tetapkan penjahit tersebut pada toko terlebih dahulu");
      o.tailorId = p.tailorId;
      record(state, user, action, o.id, p.tailorId);
      return {};
    }
    case "intake": {
      operator(user);
      const p = parse(
        z.object({ orderId: identifier, notes: text, assetId: identifier }),
        input,
      );
      const o = owned(state, user, p.orderId);
      assert(
        o.status === "awaiting_intake" && o.shippingConsent,
        "Pelanggan belum mengizinkan pemeriksaan",
      );
      asset(state, user, p.assetId, o.id);
      o.intake = { notes: p.notes, assetId: p.assetId, at: now() };
      o.status = "inspected";
      event(o, user, "Penerimaan dan kondisi awal pakaian didokumentasikan");
      return {};
    }
    case "propose_quote":
    case "issue_quote": {
      const p = parse(
        z.object({
          orderId: identifier,
          prices: z.record(z.string(), z.number().int().min(1).max(10000000)),
          materials: z.number().int().min(0).max(10000000),
          shipping: z.number().int().min(0).max(10000000),
          days: z.number().int().min(1).max(60),
          notes: text,
        }),
        input,
      );
      const o = owned(state, user, p.orderId);
      worker(user, o);
      if (action === "issue_quote") operator(user);
      assert(
        ["inspected", "awaiting_quote_approval", "on_hold"].includes(
          o.status,
        ) && o.intake,
        "Penawaran akhir memerlukan pemeriksaan fisik",
      );
      assert(o.changes.length, "Tidak ada perubahan");
      assert(
        !state.payments.some(
          (p) => p.orderId === o.id && ["pending", "paid"].includes(p.status),
        ),
        "Rekonsiliasi pembayaran yang sudah ada sebelum mengubah penawaran",
      );
      const items = o.changes.map((c) => {
        const s = state.services.find((s) => s.id === c.serviceId)!;
        assert(
          p.prices[c.id] > 0,
          "Semua item harus memiliki harga yang jelas",
        );
        return {
          label: `${s.name} · ${c.position}`,
          quantity: c.quantity,
          unitPrice: p.prices[c.id],
        };
      });
      o.quotes
        .filter((q) => ["issued", "draft"].includes(q.status))
        .forEach((q) => (q.status = "superseded"));
      const total =
        items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) +
        p.materials +
        p.shipping;
      const q = {
        id: id(),
        version: o.quotes.length + 1,
        status:
          action === "issue_quote" ? ("issued" as const) : ("draft" as const),
        items,
        materials: p.materials,
        shipping: p.shipping,
        total,
        days: p.days,
        notes: p.notes,
        createdAt: now(),
        expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
        specVersion: o.specVersion,
        specSnapshot: structuredClone(o.changes),
        policy:
          "Kebijakan prototipe v1: pengerjaan dan pengiriman fisik bersifat simulasi. Untuk pilot nyata, syarat garansi, biaya, dan pengembalian wajib disepakati ulang. Kerusakan dalam tanggung jawab layanan ditangani operator.",
      };
      o.quotes.push(q);
      if (action === "issue_quote") o.status = "awaiting_quote_approval";
      event(
        o,
        user,
        action === "issue_quote"
          ? `Penawaran versi ${q.version} diterbitkan`
          : `Penjahit mengusulkan penawaran versi ${q.version}`,
      );
      record(state, user, action, o.id, String(total));
      return {};
    }
    case "accept_quote":
    case "decline_quote": {
      const p = parse(
        z.object({
          orderId: identifier,
          quoteId: identifier,
          consent: z.literal(true),
        }),
        input,
      );
      const o = owned(state, user, p.orderId);
      customer(user, o);
      const q = activeQuote(o);
      assert(
        o.status === "awaiting_quote_approval" &&
          q?.id === p.quoteId &&
          q.status === "issued",
        "Penawaran bukan versi aktif",
      );
      assert(
        Date.parse(q.expiresAt) > Date.now(),
        "Penawaran sudah kedaluwarsa",
      );
      assert(
        q.specVersion === o.specVersion,
        "Desain telah berubah, minta penawaran baru",
      );
      q.status = action === "accept_quote" ? "accepted" : "declined";
      if (q.status === "accepted") q.acceptedAt = now();
      o.status = q.status === "accepted" ? "awaiting_payment" : "on_hold";
      event(
        o,
        user,
        q.status === "accepted"
          ? "Desain, ukuran, biaya, durasi, dan kebijakan disetujui"
          : "Penawaran ditolak; operator mengatur alternatif atau pengembalian pakaian",
      );
      record(state, user, action, o.id, q.id);
      return {};
    }
    case "release_work": {
      operator(user);
      const p = parse(z.object({ orderId: identifier }), input);
      const o = owned(state, user, p.orderId);
      const q = activeQuote(o);
      assert(
        o.status === "ready_for_work" &&
          o.intake &&
          o.shippingConsent &&
          o.tailorId &&
          q?.status === "accepted" &&
          q.specVersion === o.specVersion &&
          state.payments.some(
            (p) =>
              p.orderId === o.id && p.quoteId === q.id && p.status === "paid",
          ),
        "Pemeriksaan, persetujuan, pembayaran, dan penugasan harus lengkap",
      );
      o.workReleasedAt = now();
      o.status = "in_progress";
      event(
        o,
        user,
        "Operator melepas pekerjaan sesuai spesifikasi yang disetujui",
      );
      return {};
    }
    case "submit_qc": {
      const p = parse(
        z.object({ orderId: identifier, notes: text, assetId: identifier }),
        input,
      );
      const o = owned(state, user, p.orderId);
      worker(user, o);
      assert(
        o.status === "in_progress" && o.workReleasedAt,
        "Pekerjaan belum dilepas operator",
      );
      asset(state, user, p.assetId, o.id);
      o.qc = { notes: p.notes, assetId: p.assetId, at: now() };
      o.status = "qc";
      event(o, user, "Hasil pengerjaan diajukan untuk pemeriksaan kualitas");
      return {};
    }
    case "qc_decision": {
      operator(user);
      const p = parse(
        z.object({ orderId: identifier, passed: z.boolean(), notes: text }),
        input,
      );
      const o = owned(state, user, p.orderId);
      assert(o.status === "qc" && o.qc, "Belum ada hasil QC");
      o.status = p.passed ? "ready_to_ship" : "in_progress";
      event(
        o,
        user,
        `${p.passed ? "QC lulus" : "Perlu pengerjaan ulang"}: ${p.notes}`,
      );
      return {};
    }
    case "ship": {
      operator(user);
      const p = parse(
        z.object({
          orderId: identifier,
          tracking: z.string().trim().min(5).max(100),
        }),
        input,
      );
      const o = owned(state, user, p.orderId);
      assert(o.status === "ready_to_ship", "Pakaian belum lulus QC");
      o.tracking = p.tracking;
      o.status = "shipped";
      event(o, user, `Pengiriman simulasi dicatat: ${p.tracking}`);
      return {};
    }
    case "complete": {
      const p = parse(z.object({ orderId: identifier }), input);
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(o.status === "shipped", "Pesanan belum dikirim");
      o.status = "completed";
      event(o, user, "Pelanggan mengonfirmasi penerimaan");
      return {};
    }
    case "cancel_order": {
      const p = parse(z.object({ orderId: identifier }), input);
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(
        ["draft", "consultation", "awaiting_intake"].includes(o.status) &&
          !o.intake,
        "Pakaian sudah diterima; hubungi operator untuk pengembalian",
      );
      o.status = "cancelled";
      event(o, user, "Pengajuan dibatalkan sebelum pemeriksaan");
      return {};
    }
    case "create_claim": {
      const p = parse(
        z.object({ orderId: identifier, description: text }),
        input,
      );
      const o = owned(state, user, p.orderId);
      customer(user, o);
      assert(
        ["shipped", "delivered", "completed", "on_hold"].includes(o.status),
        "Hubungi konsultasi untuk pertanyaan sebelum pengiriman",
      );
      assert(
        !state.claims.some(
          (c) =>
            c.orderId === o.id && !["resolved", "declined"].includes(c.status),
        ),
        "Ada klaim yang masih terbuka",
      );
      const c = {
        id: id(),
        orderId: o.id,
        customerId: user.id,
        description: p.description,
        status: "submitted" as const,
        response: "",
        createdAt: now(),
      };
      state.claims.push(c);
      event(o, user, "Keluhan diterima operator");
      return {};
    }
    case "review_claim": {
      operator(user);
      const p = parse(
        z.object({
          id: identifier,
          status: z.enum([
            "under_review",
            "resolution_in_progress",
            "resolved",
            "declined",
          ]),
          response: text,
        }),
        input,
      );
      const c = state.claims.find((c) => c.id === p.id);
      assert(c, "Klaim tidak ditemukan", 404);
      assert(
        !(
          p.status === "resolved" &&
          state.payments.some(
            (x) => x.orderId === c.orderId && x.status === "pending",
          )
        ),
        "Rekonsiliasi pembayaran terlebih dahulu",
      );
      c.status = p.status;
      c.response = p.response;
      record(state, user, action, c.id, p.response);
      return {};
    }
    case "set_price": {
      const p = parse(
        z.object({
          shopId: identifier,
          serviceId: identifier,
          price: z.number().int().min(1000).max(10000000),
        }),
        input,
      );
      assert(
        user.role === "admin" ||
          (user.role === "merchant" && user.shopId === p.shopId),
        "Tidak boleh mengubah toko lain",
        403,
      );
      assert(
        state.shops.some((s) => s.id === p.shopId) &&
          state.services.some((s) => s.id === p.serviceId),
        "Layanan/toko tidak ditemukan",
      );
      const before = state.prices[p.shopId]?.[p.serviceId];
      state.prices[p.shopId] ??= {};
      state.prices[p.shopId][p.serviceId] = p.price;
      record(
        state,
        user,
        action,
        p.shopId,
        `${p.serviceId}: ${before ?? "default"} → ${p.price}`,
      );
      return {};
    }
    case "create_shop": {
      operator(user);
      const p=parse(z.object({name:z.string().trim().min(2).max(100),city:z.string().trim().min(2).max(100),category:z.string().trim().min(2).max(100),description:z.string().trim().min(5).max(1000),tailorId:identifier.optional()}),input);
      assert(!state.shops.some(s=>s.name.toLowerCase()===p.name.toLowerCase()),"Nama toko sudah digunakan");
      if(p.tailorId)assert(state.users.some(u=>u.id===p.tailorId&&u.role==='tailor'),"Pilih akun penjahit yang valid");
      const shopId=id();
      const slug=p.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'toko';
      state.shops.push({id:shopId,name:p.name,slug:slug+'-'+shopId.slice(0,8),city:p.city,category:p.category,description:p.description,image:'/images/studio.jpg',accent:'#eee9dd',active:false,approved:true,tags:[],tailorId:p.tailorId});
      state.prices[shopId]={};
      record(state,user,action,shopId,'Toko baru nonaktif: '+p.name);
      return {id:shopId};
    }
    case "assign_shop_tailor": {
      operator(user);
      const p=parse(z.object({shopId:identifier,tailorId:identifier}),input);
      const shop=state.shops.find(s=>s.id===p.shopId);assert(shop,"Toko tidak ditemukan");
      assert(state.users.some(u=>u.id===p.tailorId&&u.role==='tailor'),"Pilih akun penjahit yang valid");
      shop.tailorId=p.tailorId;
      record(state,user,action,shop.id,'Penjahit untuk pesanan baru: '+p.tailorId);
      return {};
    }
    case "set_shop": {
      operator(user);
      const p = parse(
        z.object({ shopId: identifier, active: z.boolean() }),
        input,
      );
      const s = state.shops.find((s) => s.id === p.shopId);
      assert(s, "Toko tidak ditemukan");
      if(p.active)assert(s.tailorId&&state.users.some(u=>u.id===s.tailorId&&u.role==='tailor'),"Tetapkan penjahit toko sebelum mengaktifkan toko");
      s.active = p.active;
      record(state, user, action, s.id, `Kerja sama demo: ${p.active}`);
      return {};
    }
    case "privacy": {
      const p = parse(
        z.object({
          training: z.boolean(),
          marketing: z.boolean(),
          deletionRequested: z.boolean().optional(),
        }),
        input,
      );
      state.privacy[user.id] = {
        training: p.training,
        marketing: p.marketing,
        ...(p.deletionRequested ? { deletionRequested: now() } : {}),
      };
      record(
        state,
        user,
        action,
        user.id,
        p.deletionRequested
          ? "Permintaan penghapusan dicatat; operator perlu memproses"
          : "Pilihan data diperbarui",
      );
      return {};
    }
    default:
      throw new AppError("Tindakan tidak dikenal", 404);
  }
}
export function canReadAsset(state: State, user: User, a: Asset) {
  if (a.ownerId === user.id || user.role === "admin") return true;
  if (
    a.purpose === "reference_catalog" &&
    state.referenceDesigns?.some((r) => r.image === `/api/files/${a.id}`)
  )
    return true;
  if (user.role === "merchant")
    return state.verifications.some(
      (v) => v.evidence === a.id && v.shopId === user.shopId,
    );
  const o = state.orders.find((o) => o.id === a.orderId);
  return (
    !!o &&
    o.tailorId === user.id &&
    user.role === "tailor" &&
    a.purpose !== "purchase_evidence"
  );
}
export function view(state: State, user: User | null) {
  const orders = user ? state.orders.filter((o) => visibleOrder(user, o)) : [];
  const ids = new Set(orders.map((o) => o.id));
  const users = state.users
    .filter(
      (u) =>
        u.id === user?.id ||
        u.role === "tailor" ||
        user?.role === "admin" ||
        (user?.role === "tailor" &&
          orders.some((o) => o.tailorId === user.id && o.customerId === u.id)),
    )
    .map((u) => ({
      ...u,
      email: u.id === user?.id || user?.role === "admin" ? u.email : "",
    }));
  const shops = state.shops.filter(
    (s) =>
      (s.approved && s.active) ||
      user?.role === "admin" ||
      s.id === user?.shopId ||
      orders.some((o) => o.shopId === s.id),
  );
  const shopIds = new Set(shops.map((s) => s.id));
  return {
    ...state,
    referenceDesigns: user
      ? effectiveCatalog(state.referenceDesigns)
      : [],
    users,
    shops,
    products: state.products.filter((p) => shopIds.has(p.shopId)),
    prices: Object.fromEntries(
      Object.entries(state.prices).filter(([shopId]) => shopIds.has(shopId)),
    ),
    verifications: state.verifications.filter(
      (v) =>
        user &&
        (v.customerId === user.id ||
          user.role === "admin" ||
          (user.role === "merchant" && user.shopId === v.shopId)),
    ),
    orders: orders.map((o) =>
      user?.role === "merchant"
        ? {
            ...o,
            designMarkup: undefined,
            events: o.events.map((e) => ({
              ...e,
              label: "Tahap layanan diperbarui",
              actor: "Tim layanan",
            })),
            changes: o.changes.map((c) => ({
              ...c,
              description: "Detail privat untuk pihak pengerjaan",
              position: "",
              measurements: {},
            })),
            quotes: o.quotes
              .filter((q) => q.status !== "draft")
              .map((q) => ({
                ...q,
                notes: "Catatan teknis privat",
                specSnapshot: [],
                items: q.items.map((i) => ({
                  ...i,
                  label: i.label.split(" · ")[0],
                })),
              })),
            intake: o.intake
              ? { ...o.intake, assetId: "", notes: "Diterima operator" }
              : undefined,
            qc: o.qc
              ? { ...o.qc, assetId: "", notes: "Diperiksa operator" }
              : undefined,
          }
        : user?.role === "customer"
          ? { ...o, quotes: o.quotes.filter((q) => q.status !== "draft") }
          : o,
    ),
    messages: state.messages.filter(
      (m) => ids.has(m.orderId) && user?.role !== "merchant",
    ),
    payments: state.payments.filter(
      (p) =>
        ids.has(p.orderId) &&
        (user?.role === "customer" || user?.role === "admin"),
    ),
    claims: state.claims.filter(
      (c) => ids.has(c.orderId) && user?.role !== "merchant",
    ),
    assets: state.assets.filter((a) => user && canReadAsset(state, user, a)),
    jobs: state.jobs.filter(
      (j) => user && user.role !== "merchant" && ids.has(j.orderId),
    ),
    audit: user?.role === "admin" ? state.audit : [],
    privacy: user
      ? {
          [user.id]: state.privacy[user.id] || {
            training: false,
            marketing: false,
          },
        }
      : {},
  };
}
