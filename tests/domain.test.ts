import { test } from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../src/lib/seed";
import { photoCatalog } from "../src/lib/photo-catalog";
import { execute, view, canReadAsset } from "../src/lib/domain";
import {
  activeQuote,
  type Order,
  type State,
  type User,
} from "../src/lib/model";
import {
  createPayment,
  settlePayment,
  verifySignature,
} from "../src/lib/payments";
import { createHash } from "node:crypto";
const users = (s: State) => ({
  c: s.users[0],
  m: s.users[1],
  t: s.users[2],
  a: s.users[3],
});
test("customer marks persist for the assigned tailor, remain private from merchants and lock with order", () => {
  const {s,u,o} = fixture();
  s.assets.push({id:"garment-markup",ownerId:u.c.id,orderId:o.id,name:"base.jpg",mime:"image/jpeg",storagePath:"base.jpg",purpose:"garment",createdAt:new Date().toISOString()});
  const input={orderId:o.id,assetId:"garment-markup",markup:{strokes:[{tool:"draw",width:.03,points:[[.3,.4],[.5,.5]]}]}};
  execute(s,u.c,"save_design_markup",input);
  assert.equal(view(s,u.t).orders.find(x=>x.id===o.id)?.designMarkup?.markup.strokes.length,1);
  assert.equal(view(s,u.m).orders.find(x=>x.id===o.id)?.designMarkup,undefined);
  assert.throws(()=>execute(s,u.t,"save_design_markup",input));
  assert.throws(()=>execute(s,u.c,"save_design_markup",{...input,assetId:"proof"}));
  assert.throws(()=>execute(s,u.c,"save_design_markup",{...input,markup:{strokes:[{tool:"draw",width:.03,points:[[2,0]]}]}}));
  o.status="in_progress";
  assert.throws(()=>execute(s,u.c,"save_design_markup",input));
});
test("only admin can publish dedicated licensed catalogue images; customer uploads stay private", () => {
  const { s, u } = fixture();
  const input = {
    assetId: "reference",
    name: "Kaos merah",
    attributes: ["red", "tshirt"],
    source: "Foto milik studio",
    rightsConfirmed: true,
  };
  s.assets.push({
    id: "reference",
    ownerId: u.a.id,
    name: "ref.jpg",
    mime: "image/jpeg",
    storagePath: "ref.jpg",
    purpose: "reference_catalog",
    createdAt: new Date().toISOString(),
  });
  assert.throws(() => execute(s, u.c, "add_reference", input));
  assert.equal(canReadAsset(s, u.c, s.assets.at(-1)!), false);
  execute(s, u.a, "add_reference", input);
  assert.equal(canReadAsset(s, u.c, s.assets.at(-1)!), true);
  assert.equal(view(s, u.c).referenceDesigns.length, photoCatalog.length + 1);
  assert.throws(() =>
    execute(s, u.a, "add_reference", { ...input, assetId: "proof" }),
  );
  assert.throws(() =>
    execute(s, u.a, "add_reference", { ...input, rightsConfirmed: false }),
  );
});
test("tailor can identify assigned customers without exposing unrelated customers or emails", () => {
  const { s, u, o } = fixture();
  s.users.push({
    ...u.c,
    id: "unrelated",
    name: "Other customer",
    email: "other@example.com",
  });
  const visible = view(s, u.t).users;
  assert.equal(
    visible.find((person) => person.id === o.customerId)?.name,
    u.c.name,
  );
  assert.equal(visible.find((person) => person.id === o.customerId)?.email, "");
  assert.equal(
    visible.some((person) => person.id === "unrelated"),
    false,
  );
  o.tailorId = "another-tailor";
  assert.equal(
    view(s, u.t).users.some((person) => person.id === u.c.id),
    false,
  );
});
function fixture() {
  const s = seedState(),
    u = users(s);
  s.assets.push({
    id: "proof",
    ownerId: u.c.id,
    name: "proof.jpg",
    mime: "image/jpeg",
    storagePath: "proof.jpg",
    purpose: "purchase_evidence",
    createdAt: new Date().toISOString(),
  });
  const v = execute(s, u.c, "verify_purchase", {
    shopId: "senja",
    productId: "senja-dress",
    reference: "TEST-ORDER-01",
    channel: "Shopee",
    evidence: "proof",
  }) as { id: string };
  execute(s, u.m, "review_purchase", {
    id: v.id,
    status: "verified",
    reason: "Nomor, item, dan pemohon cocok",
  });
  const r = execute(s, u.c, "create_order", { verificationId: v.id }) as {
    id: string;
  };
  const o = s.orders.find((o) => o.id === r.id)!;
  return { s, u, o };
}
function add(s: State, u: User, o: Order) {
  execute(s, u, "save_change", {
    orderId: o.id,
    serviceId: "pocket",
    description: "Kantong tersembunyi",
    position: "Sisi kiri pemakai",
    quantity: 1,
    mode: "design",
    measurements: {},
  });
}
function inspected() {
  const f = fixture();
  add(f.s, f.u.c, f.o);
  execute(f.s, f.u.c, "authorize_intake", { orderId: f.o.id, consent: true });
  f.s.assets.push({
    id: "intake",
    ownerId: f.u.a.id,
    orderId: f.o.id,
    name: "intake.jpg",
    mime: "image/jpeg",
    storagePath: "i.jpg",
    purpose: "intake",
    createdAt: new Date().toISOString(),
  });
  execute(f.s, f.u.a, "intake", {
    orderId: f.o.id,
    assetId: "intake",
    notes: "Kondisi dan kampuh sudah diperiksa dalam simulasi",
  });
  return f;
}
function quoted() {
  const f = inspected();
  execute(f.s, f.u.a, "issue_quote", {
    orderId: f.o.id,
    prices: { [f.o.changes[0].id]: 179000 },
    materials: 10000,
    shipping: 0,
    days: 3,
    notes: "Posisi kiri pemakai, spesifikasi demo",
  });
  return f;
}
test("purchase verification does not mean payment or authorize cutting", () => {
  const { s, u, o } = fixture();
  assert.equal(o.status, "draft");
  assert.equal(s.payments.length, 0);
  assert.throws(() => execute(s, u.a, "release_work", { orderId: o.id }));
});
test("unverified purchase and inactive shop cannot create service orders", () => {
  const { s, u } = fixture();
  s.verifications[0].status = "pending";
  assert.throws(() =>
    execute(s, u.c, "create_order", { verificationId: s.verifications[0].id }),
  );
  assert.throws(() =>
    execute(s, u.c, "verify_purchase", {
      shopId: "inactive",
      productId: "senja-dress",
      reference: "TEST-2",
      channel: "Shopee",
      evidence: "proof",
    }),
  );
});
test("merchant cannot verify a different shop", () => {
  const { s, u } = fixture();
  s.verifications[0].status = "pending";
  const intruder = { ...u.m, shopId: "ruang" };
  assert.throws(() =>
    execute(s, intruder, "review_purchase", {
      id: s.verifications[0].id,
      status: "verified",
      reason: "forged",
    }),
  );
  assert.equal(s.verifications[0].status, "pending");
});
test("cross-shop prices and customer price writes are denied", () => {
  const { s, u } = fixture();
  assert.throws(() =>
    execute(s, u.m, "set_price", {
      shopId: "ruang",
      serviceId: "hem",
      price: 1000,
    }),
  );
  assert.throws(() =>
    execute(s, u.c, "set_price", {
      shopId: "senja",
      serviceId: "hem",
      price: 1000,
    }),
  );
});
test("duplicate active service order for the same garment is rejected", () => {
  const { s, u, o } = fixture();
  assert.throws(() =>
    execute(s, u.c, "create_order", { verificationId: o.verificationId }),
  );
});
test("editing an item across modes retains one physical job", () => {
  const { s, u, o } = fixture();
  add(s, u.c, o);
  const item = o.changes[0];
  execute(s, u.c, "save_change", {
    orderId: o.id,
    ...item,
    mode: "measurements",
    description: "Sama, diskusi ukuran dengan penjahit",
  });
  assert.equal(o.changes.length, 1);
  assert.equal(o.changes[0].id, item.id);
});
test("measurement task rejects missing measurements", () => {
  const { s, u, o } = fixture();
  assert.throws(() =>
    execute(s, u.c, "save_change", {
      orderId: o.id,
      serviceId: "waist",
      description: "Sesuaikan ukuran",
      position: "pinggang",
      quantity: 1,
      mode: "measurements",
      measurements: {},
    }),
  );
});
test("quote before physical intake is denied", () => {
  const { s, u, o } = fixture();
  add(s, u.c, o);
  assert.throws(() =>
    execute(s, u.a, "issue_quote", {
      orderId: o.id,
      prices: { [o.changes[0].id]: 100000 },
      materials: 0,
      shipping: 0,
      days: 3,
      notes: "No intake",
    }),
  );
});
test("tailor can propose but cannot issue or accept on behalf of customer", () => {
  const { s, u, o } = inspected();
  const input = {
    orderId: o.id,
    prices: { [o.changes[0].id]: 179000 },
    materials: 0,
    shipping: 0,
    days: 3,
    notes: "Pemeriksaan oleh penjahit",
  };
  execute(s, u.t, "propose_quote", input);
  assert.equal(o.quotes[0].status, "draft");
  assert.equal(o.status, "inspected");
  assert.throws(() => execute(s, u.t, "issue_quote", input));
  assert.throws(() =>
    execute(s, u.t, "accept_quote", {
      orderId: o.id,
      quoteId: o.quotes[0].id,
      consent: true,
    }),
  );
});
test("final quote requires every job to have an explicit positive price", () => {
  const { s, u, o } = inspected();
  assert.throws(() =>
    execute(s, u.a, "issue_quote", {
      orderId: o.id,
      prices: {},
      materials: 0,
      shipping: 0,
      days: 3,
      notes: "Belum lengkap",
    }),
  );
});
test("price changes do not mutate accepted quote snapshots", () => {
  const { s, u, o } = quoted();
  const q = activeQuote(o)!;
  execute(s, u.c, "accept_quote", {
    orderId: o.id,
    quoteId: q.id,
    consent: true,
  });
  execute(s, u.m, "set_price", {
    shopId: "senja",
    serviceId: "pocket",
    price: 999000,
  });
  assert.equal(q.total, 189000);
  assert.equal(q.specSnapshot[0].description, "Kantong tersembunyi");
});
test("expired or superseded quotes cannot be accepted", () => {
  const { s, u, o } = quoted();
  const q = activeQuote(o)!;
  q.expiresAt = new Date(0).toISOString();
  assert.throws(() =>
    execute(s, u.c, "accept_quote", {
      orderId: o.id,
      quoteId: q.id,
      consent: true,
    }),
  );
});
test("payment uses server quote and repeated create/settle is idempotent", async () => {
  process.env.APP_MODE = "demo";
  delete process.env.MIDTRANS_SERVER_KEY;
  const { s, u, o } = quoted();
  const q = activeQuote(o)!;
  execute(s, u.c, "accept_quote", {
    orderId: o.id,
    quoteId: q.id,
    consent: true,
  });
  const p = await createPayment(s, u.c, o.id);
  assert.equal(p.amount, 189000);
  assert.equal((await createPayment(s, u.c, o.id)).id, p.id);
  settlePayment(s, p);
  settlePayment(s, p);
  assert.equal(s.payments.length, 1);
  assert.equal(o.status, "ready_for_work");
  assert.equal(
    o.events.filter((e) => e.label.includes("pembayaran lokal berhasil"))
      .length,
    1,
  );
});
test("late payment for an obsolete quote requires reconciliation", async () => {
  process.env.APP_MODE = "demo";
  const { s, u, o } = quoted();
  const q = activeQuote(o)!;
  execute(s, u.c, "accept_quote", {
    orderId: o.id,
    quoteId: q.id,
    consent: true,
  });
  const p = await createPayment(s, u.c, o.id);
  q.status = "superseded";
  settlePayment(s, p);
  assert.equal(o.status, "on_hold");
});
test("merchant cannot read measurements, jobs, private chat, or intake assets", () => {
  const { s, u, o } = inspected();
  o.changes[0].measurements = { waist: 80 };
  s.messages.push({
    id: "msg",
    orderId: o.id,
    senderId: u.c.id,
    senderName: "Alya",
    role: "customer",
    body: "private",
    createdAt: new Date().toISOString(),
  });
  const v = view(s, u.m);
  assert.deepEqual(v.orders[0].changes[0].measurements, {});
  assert.equal(v.messages.length, 0);
  assert.equal(
    v.assets.some((a) => a.id === "intake"),
    false,
  );
  assert.equal(
    canReadAsset(
      s,
      u.m,
      s.assets.find((a) => a.id === "intake")!,
    ),
    false,
  );
});
test("foreign customer has no order or file access", () => {
  const { s, o } = inspected();
  const foreign: User = {
    id: "other",
    name: "Other",
    email: "other@test.invalid",
    role: "customer",
  };
  assert.equal(view(s, foreign).orders.length, 0);
  assert.throws(() =>
    execute(s, foreign, "send_message", { orderId: o.id, body: "intrusion" }),
  );
  assert.equal(canReadAsset(s, foreign, s.assets[0]), false);
});
test("valid full simulated lifecycle respects release and QC gates", async () => {
  process.env.APP_MODE = "demo";
  const { s, u, o } = quoted();
  const q = activeQuote(o)!;
  execute(s, u.c, "accept_quote", {
    orderId: o.id,
    quoteId: q.id,
    consent: true,
  });
  const p = await createPayment(s, u.c, o.id);
  settlePayment(s, p);
  assert.throws(() => execute(s, u.t, "release_work", { orderId: o.id }));
  execute(s, u.a, "release_work", { orderId: o.id });
  s.assets.push({
    id: "qc",
    ownerId: u.t.id,
    orderId: o.id,
    name: "qc.jpg",
    mime: "image/jpeg",
    storagePath: "qc.jpg",
    purpose: "qc",
    createdAt: new Date().toISOString(),
  });
  execute(s, u.t, "submit_qc", {
    orderId: o.id,
    assetId: "qc",
    notes: "Sesuai spesifikasi demo",
  });
  assert.throws(() =>
    execute(s, u.a, "ship", { orderId: o.id, tracking: "DEMO-001" }),
  );
  execute(s, u.a, "qc_decision", {
    orderId: o.id,
    passed: true,
    notes: "Dimensi dan jahitan sesuai",
  });
  execute(s, u.a, "ship", { orderId: o.id, tracking: "DEMO-001" });
  execute(s, u.c, "complete", { orderId: o.id });
  assert.equal(o.status, "completed");
  execute(s, u.c, "create_claim", {
    orderId: o.id,
    description: "Ada jahitan lepas",
  });
  assert.equal(s.claims.length, 1);
});
test("private marketing/training choices are independent", () => {
  const { s, u } = fixture();
  execute(s, u.c, "privacy", { training: false, marketing: false });
  assert.equal(s.privacy[u.c.id].training, false);
  assert.equal(view(s, u.c).orders.length, 1);
});
test("forged webhook signatures are rejected", () => {
  const body = {
    order_id: "X",
    status_code: "200",
    gross_amount: "1000.00",
    signature_key: "forged",
  };
  assert.equal(verifySignature(body, "secret"), false);
  body.signature_key = createHash("sha512")
    .update("X2001000.00secret")
    .digest("hex");
  assert.equal(verifySignature(body, "secret"), true);
  assert.equal(
    verifySignature({ ...body, gross_amount: "1.00" }, "secret"),
    false,
  );
});
test("customer cannot see a tailor draft before admin issues it", () => {
  const { s, u, o } = inspected();
  execute(s, u.t, "propose_quote", {
    orderId: o.id,
    prices: { [o.changes[0].id]: 179000 },
    materials: 0,
    shipping: 0,
    days: 3,
    notes: "Internal technical proposal",
  });
  assert.equal(view(s, u.c).orders[0].quotes.length, 0);
  assert.equal(view(s, u.a).orders[0].quotes.length, 1);
});
test("repeated submit of the same change does not create a duplicate physical job", () => {
  const { s, u, o } = fixture();
  add(s, u.c, o);
  assert.throws(() => add(s, u.c, o));
  assert.equal(o.changes.length, 1);
});
test("the same purchased SKU cannot be verified for a second claimant silently", () => {
  const { s, u } = fixture();
  const copy = {
    ...s.verifications[0],
    id: "second",
    customerId: "second-customer",
    status: "pending" as const,
  };
  s.verifications.push(copy);
  assert.throws(() =>
    execute(s, u.m, "review_purchase", {
      id: "second",
      status: "verified",
      reason: "duplicate claimant",
    }),
  );
});

test("design choices persist, notify the tailor and reject arbitrary or foreign images", () => {
  const {s, u, o} = fixture();
  s.jobs.push({ id: "design-test", orderId: o.id, ownerId: u.c.id, mode: "design", status: "succeeded", specVersion: o.specVersion,
    prompt: "Saku di kanan", baseAssetId: "original", assetId: "generated-photo", createdAt: new Date().toISOString(),
    references: [{id:"right-pocket", name:"Saku kanan", image:"/references/tshirt-red-pocket-right.svg"}] });
  const input = {orderId:o.id, jobId:"design-test", referenceId:"right-pocket"};
  assert.throws(() => execute(s,u.t,"select_ai_design",input));
  assert.throws(() => execute(s,u.c,"select_ai_design",{...input, referenceId:"arbitrary"}));
  execute(s,u.c,"select_ai_design",input);
  assert.equal(s.jobs.at(-1)!.selectedReferenceId,"right-pocket");
  assert.match(s.messages.at(-1)!.body,/Saku kanan/);
  execute(s,u.c,"select_ai_design",{...input, referenceId:"generated"});
  assert.equal(s.jobs.at(-1)!.selectedReferenceId,"generated");
  const job=s.jobs.at(-1)!;
  job.variants=[{assetId:"variant-one",seed:1},{assetId:"foreign-variant",seed:2}];
  s.assets.push({id:"variant-one",ownerId:u.c.id,orderId:o.id,name:"variant",mime:"image/png",storagePath:"variant.png",purpose:"preview",createdAt:new Date().toISOString()});
  s.assets.push({id:"foreign-variant",ownerId:"someone-else",orderId:o.id,name:"foreign",mime:"image/png",storagePath:"foreign.png",purpose:"preview",createdAt:new Date().toISOString()});
  execute(s,u.c,"select_ai_design",{...input,referenceId:"generated:variant-one"});
  assert.equal(job.assetId,"variant-one");
  assert.match(s.messages.at(-1)!.body,/\/api\/files\/variant-one/);
  assert.throws(()=>execute(s,u.c,"select_ai_design",{...input,referenceId:"generated:foreign-variant"}));
  assert.throws(()=>execute(s,u.c,"select_ai_design",{...input,referenceId:"generated:not-in-job"}));
  s.jobs.at(-1)!.ownerId="another-customer";
  assert.throws(() => execute(s,u.c,"select_ai_design",input));
  s.jobs.at(-1)!.ownerId=u.c.id;
  o.status="in_progress";
  assert.throws(() => execute(s,u.c,"select_ai_design",input));
});
