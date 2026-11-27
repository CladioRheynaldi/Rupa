import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "C:/Users/Cladio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3050";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
async function session(email) {
  const context = await browser.newContext();
  const response = await context.request.post(base + "/api/auth", {
    headers: { origin: base }, data: { action: "login", email, password: "RupaDemo2026!" },
  });
  assert.equal(response.status(), 200);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page };
}
async function state(context) { return (await context.request.get(base + "/api/state")).json(); }
async function act(context, action, input) {
  const response = await context.request.post(base + "/api/action", { headers: { origin: base }, data: { action, input } });
  assert.equal(response.status(), 200, await response.text());
  return (await response.json()).result;
}
try {
  const customer = await session("alya@rupa.demo");
  const { page } = customer;
  await page.goto(base + "/shops/senja");
  const reference = "TEST-REGRESSION-" + Date.now();
  await page.getByLabel("Nomor transaksi pembelian").fill(reference);
  await page.locator("input[type=checkbox]").check();
  const submit = page.getByRole("button", { name: "Ajukan verifikasi" });
  assert.equal(await submit.isEnabled(), true);
  await submit.click();
  await page.getByRole("alert").filter({ hasText: "Unggah bukti pembelian terlebih dahulu" }).waitFor();
  assert.equal((await state(customer.context)).verifications.some((v) => v.reference === reference), false);
  // Failed upload must explain the error and permit a new attempt.
  await page.locator("input[type=file]").setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("invalid image") });
  await page.getByRole("alert").filter({ hasText: "File harus berupa foto" }).waitFor();
  assert.equal(await submit.isEnabled(), true);
  // Hold the upload to check that the disabled state is visibly explained.
  let releaseUpload;
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  await page.route("**/api/upload", async (route) => { await uploadGate; await route.continue(); });
  await page.locator("input[type=file]").setInputFiles(path.resolve("public/images/dress.jpg"));
  const uploading = page.getByRole("button", { name: "Mengunggah bukti…" });
  await uploading.waitFor();
  assert.equal(await uploading.isDisabled(), true);
  releaseUpload();
  await page.getByText("Bukti berhasil diunggah").waitFor();
  await submit.click();
  await page.waitForURL("**/workspace/verification");
  const verification = (await state(customer.context)).verifications.find((v) => v.reference === reference);
  assert.equal(verification.status, "pending");
  const pendingCard = page.locator(".verification-card").filter({ hasText: reference });
  await pendingCard.getByText("Menunggu pemilik toko memeriksa", { exact: false }).waitFor();
  assert.equal(await pendingCard.getByRole("button", { name: "Lanjut ke AI & konsultasi" }).count(), 0);
  const blocked = await customer.context.request.post(base + "/api/action", {
    headers: { origin: base }, data: { action: "create_order", input: { verificationId: verification.id } },
  });
  assert.equal(blocked.status(), 403);
  const merchant = await session("toko@rupa.demo");
  await merchant.page.goto(base + "/workspace");
  await merchant.page.getByRole("link", { name: "Periksa pengajuan pembeli" }).click();
  const merchantCard = merchant.page.locator(".verification-card").filter({ hasText: reference });
  await merchantCard.getByLabel("Catatan pemeriksaan").fill("Regression test: purchase proof verified");
  await merchantCard.getByRole("button", { name: "Simpan keputusan" }).click();
  await merchant.page.getByText("Keputusan verifikasi tersimpan", { exact: true }).waitFor();
  await page.reload();
  await page.locator(".verification-card").filter({ hasText: reference }).getByRole("button", { name: "Lanjut ke AI & konsultasi" }).click();
  await page.waitForURL("**/tools");
  await page.getByText("PILIH MODE BANTUAN AI", { exact: true }).waitFor();
  assert.equal(await page.locator(".mode-card").count(), 3);
  const order = (await state(customer.context)).orders.find((o) => o.verificationId === verification.id);
  await page.goto(base + `/orders/${order.id}/consultation`);
  await page.locator(".chat-header strong").filter({ hasText: "Bu Ratna" }).waitFor();
  const tailor = await session("penjahit@rupa.demo");
  await tailor.page.goto(base + `/orders/${order.id}/consultation`);
  assert.equal(await tailor.page.locator(".chat-header strong").textContent(), "Alya Putri");
  assert.equal(await tailor.page.locator(".chat-header .avatar").textContent(), "A");
  await tailor.page.getByRole("textbox", { name: "Pesan konsultasi" }).fill("Halo Alya, detail perubahan bisa didiskusikan di sini.");
  await tailor.page.getByRole("button", { name: "Kirim pesan" }).click();
  await tailor.page.getByText("Pesan terkirim", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Halo Alya, detail perubahan bisa didiskusikan di sini.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: purchase submission, pending access gate, merchant dashboard/review, customer continuation, 3 AI modes, role-aware chat names, and message delivery.");
} finally { await browser.close(); }
