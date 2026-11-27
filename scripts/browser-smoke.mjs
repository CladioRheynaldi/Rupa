import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const base = process.env.TEST_URL || "http://127.0.0.1:3050";
const browser = await chromium.launch({
  channel: process.env.TEST_BROWSER || "msedge",
  headless: true,
});
const contexts = [];
const errors = [];
async function context() {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(c);
  return c;
}
async function login(c, email) {
  const r = await c.request.post(base + "/api/auth", {
    headers: { origin: base },
    data: { action: "login", email, password: "RupaDemo2026!" },
  });
  assert.equal(r.status(), 200, await r.text());
}
async function state(c) {
  const r = await c.request.get(base + "/api/state");
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function action(c, a, input) {
  const r = await c.request.post(base + "/api/action", {
    headers: { origin: base },
    data: { action: a, input },
  });
  assert.equal(r.status(), 200, await r.text());
  return (await r.json()).result;
}
async function photo(c, purpose, orderId) {
  const r = await c.request.post(base + "/api/upload", {
    headers: { origin: base },
    multipart: {
      file: {
        name: "test-dress.jpg",
        mimeType: "image/jpeg",
        buffer: await (
          await import("node:fs/promises")
        ).readFile(path.resolve("public/images/dress.jpg")),
      },
      purpose,
      ...(orderId ? { orderId } : {}),
    },
  });
  assert.equal(r.status(), 200, await r.text());
  return (await r.json()).id;
}
try {
  await mkdir("test-results", { recursive: true });
  const customer = await context(),
    page = await customer.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Pakaian pilihanmu. Sentuhan khasmu." })
    .waitFor();
  assert.equal(await page.locator(".shop-card").count(), 3);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/login");
  await page.getByRole("button", { name: "Pelanggan", exact: true }).click();
  await page.waitForURL("**/workspace");
  await page.goto(base + "/shops/senja");
  await page
    .getByLabel("Nomor transaksi pembelian")
    .fill("TEST-UI-" + Date.now());
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("public/images/dress.jpg"));
  await page.getByText("Bukti berhasil diunggah").waitFor();
  await page.locator("input[type=checkbox]").check();
  await page
    .getByRole("button", { name: "Ajukan verifikasi", exact: false })
    .click();
  await page.waitForURL("**/workspace/verification");
  let s = await state(customer);
  const verification = s.verifications.at(-1);
  assert.equal(verification.status, "pending");
  const merchant = await context();
  await login(merchant, "toko@rupa.demo");
  const merchantPage = await merchant.newPage();
  await merchantPage.goto(base + "/workspace/verification");
  await merchantPage
    .getByLabel("Catatan pemeriksaan")
    .last()
    .fill("Nomor transaksi, item dan pemohon sesuai pada pengujian");
  await merchantPage
    .getByRole("button", { name: "Simpan keputusan", exact: false })
    .last()
    .click();
  await merchantPage.getByText("Keputusan verifikasi tersimpan").waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Lanjut ke AI & konsultasi", exact: false })
    .last()
    .click();
  await page.waitForURL("**/orders/*/tools");
  await page.getByLabel("Posisi pada pakaian").fill("Sisi kiri pemakai");
  await page
    .getByLabel("Ceritakan detail yang kamu inginkan")
    .fill("Satu kantong tersembunyi, pertahankan siluet pakaian.");
  await page
    .getByRole("button", { name: "Tambah perubahan", exact: true })
    .click();
  await page.getByText("Detail perubahan ditambahkan").waitFor();
  s = await state(customer);
  let o = s.orders.find((x) => x.verificationId === verification.id);
  assert.equal(o.changes.length, 1);
  await page.getByRole("button", { name: /Bantu Sesuaikan Ukuran/ }).click();
  await page.waitForURL("**/measurements");
  await page.reload();
  await page.getByText("Ukuran seperlunya", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Lihat Pratinjau Desain/ }).click();
  await page.waitForURL("**/preview");
  await page.getByText("Lihat kemungkinan desainmu.").waitFor();
  await page.getByRole("button", { name: /Ide Desain & Detail/ }).click();
  await page.waitForURL("**/design");
  assert.equal(
    (await state(customer)).orders.find((x) => x.id === o.id).changes.length,
    1,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/order-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/order-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const change = o.changes[0];
  const aiRequest = await customer.request.post(base + "/api/ai", {
    headers: { origin: base },
    data: {
      orderId: o.id,
      mode: "design",
      prompt: "Bantu jelaskan kantong tersembunyi di kiri pemakai.",
    },
  });
  assert.equal(aiRequest.status(), 200, await aiRequest.text());
  const aiResult = await aiRequest.json();
  if (!aiResult.configured) {
    const current = await state(customer);
    const failedJob = current.jobs.find((j) => j.id === aiResult.id);
    assert.equal(failedJob.status, "failed");
    assert.match(failedJob.error, /belum tersedia/);
    assert.equal(failedJob.result, undefined);
  }
  await action(customer, "save_change", {
    ...change,
    orderId: o.id,
    mode: "measurements",
    description: "Kantong yang sama, diperbarui tanpa duplikasi",
  });
  s = await state(customer);
  assert.equal(s.orders.find((x) => x.id === o.id).changes.length, 1);
  await action(customer, "send_message", {
    orderId: o.id,
    body: "Apakah posisi kantong ini bisa dikerjakan?",
  });
  await action(customer, "authorize_intake", { orderId: o.id, consent: true });
  const admin = await context();
  await login(admin, "admin@rupa.demo");
  const intake = await photo(admin, "intake", o.id);
  await action(admin, "intake", {
    orderId: o.id,
    assetId: intake,
    notes: "Pemeriksaan kondisi awal simulasi. Kampuh dan bahan ditinjau.",
  });
  await action(admin, "issue_quote", {
    orderId: o.id,
    prices: { [change.id]: 179000 },
    materials: 10000,
    shipping: 0,
    days: 3,
    notes:
      "Satu kantong di kiri pemakai. Penawaran untuk pengujian, bukan pengerjaan fisik.",
  });
  s = await state(customer);
  o = s.orders.find((x) => x.id === o.id);
  let q = o.quotes.at(-1);
  await action(customer, "accept_quote", {
    orderId: o.id,
    quoteId: q.id,
    consent: true,
  });
  const payment = await action(customer, "create_payment", { orderId: o.id });
  assert.equal(payment.amount, 189000);
  assert.equal(payment.mode, "simulation");
  await action(customer, "simulate_payment", { paymentId: payment.id });
  await action(customer, "simulate_payment", { paymentId: payment.id });
  await action(admin, "release_work", { orderId: o.id });
  const tailor = await context();
  await login(tailor, "penjahit@rupa.demo");
  const qc = await photo(tailor, "qc", o.id);
  await action(tailor, "submit_qc", {
    orderId: o.id,
    assetId: qc,
    notes: "Hasil simulasi sesuai spesifikasi.",
  });
  await action(admin, "qc_decision", {
    orderId: o.id,
    passed: true,
    notes: "QC simulasi lulus",
  });
  await action(admin, "ship", { orderId: o.id, tracking: "DEMO-TEST-001" });
  await action(customer, "complete", { orderId: o.id });
  await action(customer, "create_claim", {
    orderId: o.id,
    description: "Keluhan contoh untuk menguji kanal garansi.",
  });
  s = await state(admin);
  const claim = s.claims.find((c) => c.orderId === o.id);
  await action(admin, "review_claim", {
    id: claim.id,
    status: "under_review",
    response: "Klaim demonstrasi diterima, belum ada penggantian uang nyata.",
  });
  const forbidden = await merchant.request.post(base + "/api/action", {
    headers: { origin: base },
    data: {
      action: "set_price",
      input: { shopId: "ruang", serviceId: "hem", price: 1000 },
    },
  });
  assert.equal(forbidden.status(), 403);
  const secret = await merchant.request.get(base + "/api/files/" + intake);
  assert.equal(secret.status(), 404);
  const crossOrigin = await customer.request.post(base + "/api/action", {
    headers: { origin: "https://untrusted.invalid" },
    data: { action: "complete", input: { orderId: o.id } },
  });
  assert.equal(crossOrigin.status(), 403);
  const anonymous = await context();
  const anonymousFile = await anonymous.request.get(
    base + "/api/files/" + intake,
  );
  assert.equal(anonymousFile.status(), 401);
  const webhook = await anonymous.request.post(
    base + "/api/payments/notification",
    { data: { order_id: "forged", signature_key: "forged" } },
  );
  assert.notEqual(webhook.status(), 200);
  await page.goto(base + "/orders/" + o.id);
  await page.getByRole("button", { name: "Penawaran", exact: true }).click();
  await page.getByText("Total penawaran").waitFor();
  await page.screenshot({
    path: "test-results/quote-desktop.png",
    fullPage: true,
  });
  await merchantPage.goto(base + "/workspace");
  await merchantPage.screenshot({
    path: "test-results/merchant-dashboard.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        journey:
          "purchase verification → changes → consultation → intake → final quote → acceptance → simulated payment → release → QC → delivery → claim",
        roleContexts: 4,
        screenshots: 6,
        orderId: o.id,
        checks: [
          "desktop/mobile layout",
          "private files",
          "cross-shop prices",
          "cross-origin mutation",
          "forged webhook",
          "duplicate payment",
          "stable change IDs",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
