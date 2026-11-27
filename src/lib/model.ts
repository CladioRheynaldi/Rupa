import type { DesignMarkup } from "./design-markup";
export type Role = "customer" | "merchant" | "tailor" | "admin";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  shopId?: string;
};
export type Shop = {
  id: string;
  name: string;
  slug: string;
  category: string;
  city: string;
  description: string;
  image: string;
  accent: string;
  active: boolean;
  approved: boolean;
  tags: string[];
  tailorId?: string;
};
export type Product = {
  id: string;
  shopId: string;
  name: string;
  sku: string;
  material: string;
  image: string;
  price: number;
};
export type Service = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  unit: string;
  review: boolean;
  days: number;
  measurements?: string[];
};
export type Verification = {
  id: string;
  customerId: string;
  shopId: string;
  productId: string;
  reference: string;
  channel: string;
  evidence: string;
  status: "pending" | "needs_info" | "verified" | "rejected";
  reason: string;
  createdAt: string;
};
export type Change = {
  id: string;
  serviceId: string;
  description: string;
  position: string;
  quantity: number;
  measurements: Record<string, number>;
  mode: string;
};
export type OrderStatus =
  | "draft"
  | "consultation"
  | "awaiting_intake"
  | "inspected"
  | "awaiting_quote_approval"
  | "awaiting_payment"
  | "ready_for_work"
  | "in_progress"
  | "qc"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "completed"
  | "on_hold"
  | "cancelled";
export type Quote = {
  id: string;
  version: number;
  status: "draft" | "issued" | "accepted" | "declined" | "superseded";
  items: { label: string; quantity: number; unitPrice: number }[];
  materials: number;
  shipping: number;
  total: number;
  days: number;
  notes: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  specVersion: number;
  specSnapshot: Change[];
  policy: string;
};
export type Event = { id: string; label: string; at: string; actor: string };
export type Order = {
  id: string;
  customerId: string;
  shopId: string;
  productId: string;
  verificationId: string;
  status: OrderStatus;
  tailorId: string;
  changes: Change[];
  specVersion: number;
  quotes: Quote[];
  events: Event[];
  createdAt: string;
  intake?: { notes: string; assetId: string; at: string };
  qc?: { notes: string; assetId: string; at: string };
  tracking?: string;
  shippingConsent?: string;
  workReleasedAt?: string;
  designMarkup?: { assetId: string; markup: DesignMarkup; updatedAt: string };
};
export type Message = {
  id: string;
  orderId: string;
  senderId: string;
  senderName: string;
  role: Role;
  body: string;
  createdAt: string;
};
export type Payment = {
  id: string;
  orderId: string;
  quoteId: string;
  providerOrderId: string;
  amount: number;
  status: "pending" | "paid" | "expired" | "failed" | "refunded";
  mode: "simulation" | "midtrans_sandbox";
  token?: string;
  redirectUrl?: string;
  createdAt: string;
};
export type Claim = {
  id: string;
  orderId: string;
  customerId: string;
  description: string;
  status:
    | "submitted"
    | "under_review"
    | "resolution_in_progress"
    | "resolved"
    | "declined";
  response: string;
  createdAt: string;
};
export type Asset = {
  id: string;
  ownerId: string;
  orderId?: string;
  name: string;
  mime: string;
  storagePath: string;
  purpose: string;
  createdAt: string;
};
export type AIJob = {
  id: string;
  orderId: string;
  ownerId: string;
  mode: string;
  status: "queued" | "running" | "succeeded" | "failed" | "stale";
  specVersion: number;
  prompt: string;
  result?: string;
  assetId?: string;
  baseAssetId?: string;
  variants?: { assetId: string; seed: number; label?: string; instruction?: string }[];
  variationCount?: number;
  markup?: DesignMarkup;
  engine?: "diffusion" | "cgan" | "sdxl" | "catalog";
  generation?: "inpaint" | "text";
  region?: { x: number; y: number; width: number; height: number };
  seed?: number;
  editInstruction?: string;
  model?: string;
  previewError?: string;
  selectedReferenceId?: string;
  references?: { id: string; name: string; image: string; source?: string; sourceUrl?: string; kind?: string; score?: number; match?: string }[];
  referenceNote?: string;
  error?: string;
  createdAt: string;
};
export type ReferenceDesign = {
  id: string;
  name: string;
  image: string;
  attributes: string[];
  source: string;
  sourceUrl?: string;
  license?: string;
  category?: string;
  kind: "illustration" | "photo";
};
export type Audit = {
  id: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  at: string;
};
export type State = {
  referenceDesigns?: ReferenceDesign[];
  users: User[];
  shops: Shop[];
  products: Product[];
  services: Service[];
  prices: Record<string, Record<string, number>>;
  verifications: Verification[];
  orders: Order[];
  messages: Message[];
  payments: Payment[];
  claims: Claim[];
  assets: Asset[];
  jobs: AIJob[];
  audit: Audit[];
  privacy: Record<
    string,
    { training: boolean; marketing: boolean; deletionRequested?: string }
  >;
};
export type Bootstrap = State & {
  user: User | null;
  mode: "demo" | "supabase";
  demoMenu?: boolean;
  integrations: {
    ai: boolean;
    midtrans: boolean;
    aiHealth?: {
      ok: boolean;
      analysis_ready: boolean;
      retrieval_ready: boolean;
      preview_ready: boolean;
      inpainting_ready?: boolean;
      sdxl_ready?: boolean;
        controlnet_ready?: boolean;
      device?: string;
      gpu_name?: string;
      cgan_ready?: boolean;
      cgan_epochs?: number;
      cgan_samples?: number;
    };
  };
  revision: number;
};
export const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const statusLabel: Record<string, string> = {
  draft: "Draf perubahan",
  consultation: "Konsultasi",
  awaiting_intake: "Menunggu pakaian",
  inspected: "Pakaian diperiksa",
  awaiting_quote_approval: "Menunggu persetujuan",
  awaiting_payment: "Menunggu pembayaran",
  ready_for_work: "Siap ditugaskan",
  in_progress: "Sedang dikerjakan",
  qc: "Pemeriksaan kualitas",
  ready_to_ship: "Siap dikirim",
  shipped: "Dalam pengiriman",
  delivered: "Sudah diterima",
  completed: "Selesai",
  on_hold: "Ditinjau operator",
  cancelled: "Dibatalkan",
  pending: "Menunggu",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  needs_info: "Perlu informasi",
  paid: "Lunas",
  failed: "Gagal",
  expired: "Kedaluwarsa",
  submitted: "Diajukan",
  under_review: "Sedang ditinjau",
  resolution_in_progress: "Penyelesaian berlangsung",
  resolved: "Terselesaikan",
  declined: "Ditolak",
  succeeded: "Selesai",
  running: "Diproses",
  queued: "Dalam antrean",
  stale: "Versi lama",
};
export const roleLabel: Record<Role, string> = {
  customer: "Pelanggan",
  merchant: "Pemilik toko",
  tailor: "Mitra penjahit",
  admin: "Admin studio",
};
export function visibleOrder(user: User, order: Order) {
  return (
    user.role === "admin" ||
    order.customerId === user.id ||
    (user.role === "merchant" && user.shopId === order.shopId) ||
    (user.role === "tailor" && order.tailorId === user.id)
  );
}
export function activeQuote(order: Order) {
  return [...order.quotes]
    .reverse()
    .find((q) => ["issued", "accepted"].includes(q.status));
}
export function estimate(
  state: Pick<State, "services" | "prices">,
  order: Pick<Order, "shopId" | "changes">,
) {
  let unknown = false;
  let total = 0;
  for (const c of order.changes) {
    const s = state.services.find((s) => s.id === c.serviceId);
    const price = state.prices[order.shopId]?.[c.serviceId] ?? s?.price;
    if (price == null) unknown = true;
    else total += price * c.quantity;
  }
  return { total, unknown };
}
