"use client";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { DesignMarkupEditor } from "./design-markup-editor";
import { NumberedDesignWorkspace } from "./numbered-design-workspace";
import type { DesignMarkup } from "@/lib/design-markup";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Check,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  Loader2,
  Scissors,
  Sparkles,
  Ruler,
  Image as ImageIcon,
  Store,
  Package,
  MessageCircle,
  ShieldCheck,
  LockKeyhole,
  LogOut,
  Search,
  SlidersHorizontal,
  X,
  Upload,
  Clock,
  MapPin,
  Trash2,
  Settings2,
  ReceiptText,
  Users,
  History,
  Info,
  Send,
  Menu,
  AlertCircle,
  CheckCircle2,
  Leaf,
  MoveUpRight,
} from "lucide-react";
import {
  type Bootstrap,
  type Order,
  type User,
  type Change,
  activeQuote,
  estimate,
  money,
  statusLabel,
  roleLabel,
} from "@/lib/model";

type ApiResult = {
  ok?: boolean;
  result?: Record<string, unknown>;
  id?: string;
  url?: string;
  message?: string;
  error?: string;
};
async function request(url: string, data?: unknown): Promise<ApiResult> {
  const r = await fetch(
    url,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : { cache: "no-store" },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Permintaan belum berhasil");
  return j;
}
const short = (s: string) => s.slice(0, 8).toUpperCase();
const date = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Form({
  children,
  onSubmit,
  className = "",
}: {
  children: ReactNode;
  onSubmit: (f: FormData) => Promise<unknown> | void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className={`form ${className}`}
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await onSubmit(f);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        {error && (
          <div className="inline-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        {busy && (
          <div className="form-loading">
            <Loader2 size={15} className="spin" /> Menyimpan…
          </div>
        )}
      </fieldset>
    </form>
  );
}
function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Scissors size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <Info size={17} />
      <div>{children}</div>
    </div>
  );
}
function JobReferences({
  references, onSelect, selectedId,
}: {
  onSelect?: (id: string) => Promise<void>;
  selectedId?: string;
  references?: NonNullable<import("@/lib/model").AIJob["references"]>;
}) {
  if (!references?.length) return null;
  return (
    <div>
      <p>
        <strong>{references.length} gambar referensi</strong> · Foto katalog, bukan perubahan foto awal atau bukti hasil jahitan.
      </p>
      <div className="reference-grid">
        {references.map((r) => (
          <div key={r.id}>
            <a href={r.image} target="_blank" rel="noreferrer">
              <img src={r.image} alt={`Referensi umum ${r.name}`} />
              <strong>{r.name}</strong>
              <small>{r.match || "Inspirasi untuk dikonfirmasi dengan penjahit"}</small>
              {r.source && <small>{r.source}</small>}
            </a>
            {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-button">Sumber gambar & lisensi</a>}
            {onSelect && <Form onSubmit={async () => { await onSelect(r.id); }}>
              <Button type="submit" className="secondary small">{selectedId === r.id ? "Terpilih untuk konsultasi" : "Pilih referensi ini"}</Button>
            </Form>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Studio() {
  const router = useRouter(),
    pathname = usePathname();
  const [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [account, setAccount] = useState(false),
    [mobile, setMobile] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setData(j);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 12000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    setMobile(false);
    setAccount(false);
    window.scrollTo(0, 0);
  }, [pathname]);
  const act = async (
    action: string,
    input: unknown,
    success = "Perubahan tersimpan",
  ) => {
    const r = await request("/api/action", { action, input });
    await refresh();
    setToast(success);
    return r.result || {};
  };
  const auth = async (action: string, input: Record<string, unknown>) => {
    const r = await request("/api/auth", { action, ...input });
    await refresh();
    if (action === "login") {
      router.push("/workspace");
      setToast("Selamat datang di Rupa");
    } else if (action === "logout") router.push("/");
    else setToast(r.message || "Tersimpan");
    return r;
  };
  const upload = async (file: File, purpose: string, orderId?: string) => {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("purpose", purpose);
    if (orderId) fd.set("orderId", orderId);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    await refresh();
    return j.id as string;
  };
  if (error && !data)
    return (
      <main className="boot-error">
        <div className="brand">
          rupa<span>®</span>
        </div>
        <h1>Studio belum tersambung.</h1>
        <p>{error}</p>
        <Button
          onClick={() => {
            setError("");
            refresh().catch((e) => setError(e.message));
          }}
        >
          Coba lagi <ArrowRight size={16} />
        </Button>
      </main>
    );
  if (!data)
    return (
      <main className="boot-error">
        <div className="brand">
          rupa<span>®</span>
        </div>
        <Loader2 className="spin" />
        <p>Menyiapkan ruang untuk gayamu…</p>
      </main>
    );
  const user = data.user;
  const dashboard = pathname.startsWith("/workspace"),
    orderPath = pathname.startsWith("/orders/");
  const page = () => {
    if (
      [
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ].includes(pathname)
    )
      return <AuthPage path={pathname} data={data} auth={auth} />;
    if (pathname === "/") return <Home data={data} />;
    if (pathname === "/shops") return <Shops data={data} />;
    if (pathname.startsWith("/shops/")) {
      const shop = data.shops.find((s) => s.id === pathname.split("/")[2]);
      return shop ? (
        <ShopDetail shopId={shop.id} data={data} act={act} upload={upload} />
      ) : (
        <Empty
          title="Toko belum tersedia"
          description="Toko mungkin sedang tidak menerima permintaan baru."
        >
          <Link href="/shops" className="button">
            Lihat toko lainnya
          </Link>
        </Empty>
      );
    }
    if (pathname === "/how-it-works") return <How />;
    if (!user)
      return (
        <div className="page-shell">
          <Empty
            title="Masuk untuk melanjutkan"
            description="Pesanan, percakapan, dan data pribadimu hanya bisa diakses melalui akunmu."
          >
            <Link href="/login" className="button">
              Masuk <ArrowRight size={16} />
            </Link>
          </Empty>
        </div>
      );
    if (orderPath) {
      const o = data.orders.find((o) => o.id === pathname.split("/")[2]);
      return o ? (
        <OrderDetail
          key={`${o.id}-${pathname.split("/")[3] || "tools"}`}
          initialSection={pathname.split("/")[3] || "tools"}
          order={o}
          data={data}
          act={act}
          upload={upload}
          notify={setToast}
          refresh={refresh}
        />
      ) : (
        <Empty
          title="Pesanan tidak ditemukan"
          description="Periksa akun atau nomor pesananmu."
        />
      );
    }
    if (pathname === "/account") return <Privacy data={data} act={act} />;
    return (
      <Workspace
        section={pathname.split("/")[2] || "orders"}
        data={data}
        act={act}
        upload={upload}
      />
    );
  };
  return (
    <>
      <div className="demo-bar">
        <span className="status-dot" />{" "}
        {data.mode === "demo" ? "STUDIO DEMO" : "PROTOTIPE SUPABASE"}
        <span className="demo-divider" />
        Eksplorasi layanan · tidak ada pengerjaan atau pembayaran uang nyata
        <Link href="/how-it-works">
          Kenali prosesnya <ArrowUpRight size={12} />
        </Link>
        {data.demoMenu && <Link href="/login">Menu demo</Link>}
      </div>
      <header className="header">
        <Link href="/" className="brand" aria-label="Rupa beranda">
          rupa<span>®</span>
        </Link>
        <nav className={mobile ? "nav open" : "nav"}>
          <Link
            className={pathname.startsWith("/shops") ? "selected" : ""}
            href="/shops"
          >
            Temukan toko
          </Link>
          <Link
            href="/how-it-works"
            className={pathname === "/how-it-works" ? "selected" : ""}
          >
            Cara kerja
          </Link>
          {user && (
            <Link
              href="/workspace"
              className={dashboard || orderPath ? "selected" : ""}
            >
              {user.role === "customer" ? "Pesanan saya" : "Ruang kerja"}
            </Link>
          )}
        </nav>
        <div className="header-actions">
          <span className="region">
            <MapPin size={14} /> Jabodetabek
          </span>
          {user ? (
            <div className="account-wrap">
              <button
                className="account-button"
                onClick={() => setAccount(!account)}
              >
                <span className="avatar">{user.name.slice(0, 1)}</span>
                <span>{user.name.split(" ")[0]}</span>
                <ChevronDown size={14} />
              </button>
              {account && (
                <div className="account-menu">
                  <small>{roleLabel[user.role]}</small>
                  <strong>{user.name}</strong>
                  <Link href="/account">
                    <LockKeyhole size={16} /> Akun & privasi
                  </Link>
                  {data.demoMenu && <Link href="/login" onClick={()=>setAccount(false)}><Users size={16}/>Ganti peran demo</Link>}
                  <button
                    onClick={() =>
                      auth("logout", {}).catch((e) => setToast(e.message))
                    }
                  >
                    <LogOut size={16} /> Keluar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link className="button small" href="/login">
              Masuk <ArrowUpRight size={15} />
            </Link>
          )}
          <button
            className="mobile-toggle"
            aria-label="Buka menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={23} />
          </button>
        </div>
      </header>
      <div className={dashboard ? "workspace-layout" : ""}>
        {dashboard && user && (
          <Sidebar user={user} section={pathname.split("/")[2] || "orders"} />
        )}
        <main className={dashboard ? "workspace-main" : "main"}>{page()}</main>
      </div>
      {!dashboard && (
        <footer className="footer">
          <div>
            <Link href="/" className="brand">
              rupa<span>®</span>
            </Link>
            <p>
              Sudah kamu pilih.
              <br />
              Sekarang, jadikan lebih kamu.
            </p>
          </div>
          <div className="footer-links">
            <Link href="/shops">Toko pilihan</Link>
            <Link href="/how-it-works">Proses & tanggung jawab</Link>
            <Link href="/account">Privasi</Link>
          </div>
          <small>
            Prototipe · 2026
            <br />
            Toko dan koleksi adalah data demonstrasi.
          </small>
        </footer>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button aria-label="Tutup pesan" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
type Actions = {
  act: (
    action: string,
    input: unknown,
    success?: string,
  ) => Promise<Record<string, unknown>>;
  upload: (file: File, purpose: string, orderId?: string) => Promise<string>;
};

function Home({ data }: { data: Bootstrap }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-line" /> PERSONALISASI, TANPA MULAI DARI NOL
          </div>
          <h1>
            Pakaian pilihanmu.
            <br />
            <em>Sentuhan khasmu.</em>
          </h1>
          <p>
            Suka bajunya, ingin beda detailnya?
            <br />
            Wujudkan idemu bersama toko lokal dan penjahit pilihan.
          </p>
          <div className="hero-actions">
            <Link href="/shops" className="button">
              Temukan tokomu <ArrowUpRight size={19} />
            </Link>
            <Link href="/how-it-works" className="text-link">
              Lihat cara kerja <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-footnote">
            <span className="line-art">
              <Scissors size={22} />
            </span>
            <span>
              Dari satu detail kecil,
              <br />
              <strong>jadi sesuatu yang terasa milikmu.</strong>
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <img
            src="/images/hero.jpg"
            alt="Inspirasi siluet pakaian untuk gaya personal"
          />
          <div className="photo-label">
            <span>THE PERSONAL EDIT</span>
            <span>01 — 03</span>
          </div>
          <div className="hero-note">
            <span className="note-icon">
              <Sparkles size={22} />
            </span>
            <span>
              Satu pakaian.
              <br />
              <strong>Banyak kemungkinan.</strong>
            </span>
            <ArrowUpRight size={20} />
          </div>
          <div className="image-caption">
            Pilihanmu, dengan sudut pandang baru.
          </div>
        </div>
      </section>
      <div className="principles">
        <div>
          <Scissors size={21} />
          <span>
            Dikerjakan penjahit,
            <br />
            <strong>didampingi teknologi.</strong>
          </span>
        </div>
        <div>
          <ShieldCheck size={21} />
          <span>
            Perubahan dimulai
            <br />
            <strong>setelah kamu setuju.</strong>
          </span>
        </div>
        <div>
          <LockKeyhole size={21} />
          <span>
            Kamu yang menentukan
            <br />
            <strong>data yang dibagikan.</strong>
          </span>
        </div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">BERAWAL DARI TOKO PILIHAN</div>
            <h2>
              Temukan yang dekat
              <br />
              dengan <em>gayamu.</em>
            </h2>
          </div>
          <Link className="text-link" href="/shops">
            Jelajahi semua toko <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="shop-grid">
          {data.shops
            .filter((s) => s.active && s.approved)
            .slice(0, 3)
            .map((s, i) => (
              <ShopCard key={s.id} shop={s} index={i} />
            ))}
        </div>
      </section>
      <section className="process-strip">
        <div>
          <div className="eyebrow">DARI IDE KE PAKAIAN</div>
          <h2>
            Detailnya berubah.
            <br />
            <em>Prosesnya jelas.</em>
          </h2>
          <Link className="text-link" href="/how-it-works">
            Kenali setiap langkah <ArrowRight size={17} />
          </Link>
        </div>
        <div className="process-steps">
          {[
            [
              "01",
              "Beli pakaian favoritmu",
              "Mulai dari koleksi toko mitra, lalu verifikasi pembelianmu.",
            ],
            [
              "02",
              "Ceritakan perubahanmu",
              "Pilih ide, ukuran, atau pratinjau. Diskusikan dengan penjahit.",
            ],
            [
              "03",
              "Setujui, baru dikerjakan",
              "Setelah diperiksa, kamu menyetujui desain, biaya, dan waktu.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function ShopCard({
  shop,
  index = 0,
}: {
  shop: Bootstrap["shops"][0];
  index?: number;
}) {
  return (
    <Link href={`/shops/${shop.id}`} className="shop-card">
      <div className="shop-image" style={{ background: shop.accent }}>
        <img src={shop.image} alt={`Inspirasi koleksi ${shop.name}`} />
        <span className="shop-number">0{index + 1}</span>
        <span className="circle-arrow">
          <ArrowUpRight size={22} />
        </span>
      </div>
      <div className="shop-meta">
        <div>
          <small>{shop.category}</small>
          <h3>{shop.name}</h3>
        </div>
        <span>
          <MapPin size={12} />
          {shop.city}
        </span>
      </div>
      <div className="tags">
        {shop.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </Link>
  );
}
function Shops({ data }: { data: Bootstrap }) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Semua");
  const shops = data.shops.filter(
    (s) =>
      s.active &&
      s.approved &&
      `${s.name} ${s.city} ${s.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "Semua" || s.tags.includes(filter)),
  );
  return (
    <div className="page-shell">
      <div className="eyebrow">TOKO LOKAL, KEMUNGKINAN BARU</div>
      <div className="page-heading">
        <h1>
          Mulai dari
          <br />
          <em>yang kamu suka.</em>
        </h1>
        <p>
          Pilih toko tempat kamu membeli pakaian.
          <br />
          Kami bantu menyempurnakan detailnya.
        </p>
      </div>
      <div className="catalog-toolbar">
        <div className="filter-chips">
          {["Semua", "Dress", "Minimalis", "Modest", "Kasual"].map((x) => (
            <button
              key={x}
              className={filter === x ? "active" : ""}
              onClick={() => setFilter(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Cari toko atau kota"
            placeholder="Cari toko atau kota"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="catalog-count">
        {shops.length} toko mitra demo{" "}
        <span>Terpilih untuk prototipe Jabodetabek</span>
      </div>
      <div className="shop-grid">
        {shops.map((s, i) => (
          <ShopCard key={s.id} shop={s} index={i} />
        ))}
      </div>
      {!shops.length && (
        <Empty
          title="Belum ada yang cocok"
          description="Coba kata pencarian atau pilihan kategori lainnya."
        />
      )}
    </div>
  );
}

function ShopDetail({
  shopId,
  data,
  act,
  upload,
}: Actions & { shopId: string; data: Bootstrap }) {
  const router = useRouter();
  const shop = data.shops.find((s) => s.id === shopId)!;
  const products = data.products.filter((p) => p.shopId === shopId);
  const [product, setProduct] = useState(products[0]?.id || ""),
    [evidence, setEvidence] = useState(""),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const current = data.products.find((p) => p.id === product);
  const own = data.verifications.filter(
    (v) => v.shopId === shopId && v.customerId === data.user?.id,
  );
  return (
    <div className="page-shell">
      <Link className="back-link" href="/shops">
        <ArrowLeft size={15} /> Semua toko
      </Link>
      <section className="shop-detail-hero">
        <div>
          <div className="eyebrow">{shop.category.toUpperCase()}</div>
          <h1>
            {shop.name}
            <span className="small-dot">.</span>
          </h1>
          <p>{shop.description}</p>
          <span className="location">
            <MapPin size={15} />
            {shop.city} <span>·</span>{" "}
            <Badge tone="green">Mitra demo aktif</Badge>
          </span>
        </div>
        <img src={shop.image} alt={`Koleksi ${shop.name}`} />
      </section>
      <div className="detail-grid">
        <section>
          <div className="eyebrow">01 / PAKAIAN YANG SUDAH KAMU BELI</div>
          <h2>Mulai dari pembelianmu.</h2>
          <p className="muted">
            Pilih pakaian dan ajukan bukti pembelian. Toko akan memeriksa
            sebelum kamu menggunakan layanan.
          </p>
          <div className="product-options">
            {products.map((p) => (
              <button
                className={`product-option ${product === p.id ? "active" : ""}`}
                key={p.id}
                onClick={() => setProduct(p.id)}
              >
                <img src={p.image} alt={p.name} />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.material}</small>
                  <span>{money(p.price)}</span>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          {data.user?.role === "customer" ? (
            <div className="panel">
              <Form
                onSubmit={async (f) => {
                  if (!evidence)
                    throw new Error("Unggah bukti pembelian terlebih dahulu");
                  await act(
                    "verify_purchase",
                    {
                      shopId,
                      productId: product,
                      reference: f.get("reference"),
                      channel: f.get("channel"),
                      evidence,
                    },
                    "Pengajuan dikirim ke toko",
                  );
                  setEvidence("");
                  router.push("/workspace/verification");
                }}
              >
                <div className="form-row">
                  <Field label="Nomor transaksi pembelian">
                    <input
                      name="reference"
                      required
                      minLength={4}
                      placeholder="Contoh: SNJ-2026-001"
                    />
                  </Field>
                  <Field label="Kanal pembelian">
                    <select name="channel">
                      <option>Shopee</option>
                      <option>Tokopedia</option>
                      <option>TikTok Shop</option>
                      <option>Lainnya</option>
                    </select>
                  </Field>
                </div>
                <Field
                  label="Bukti pembelian (wajib)"
                  hint="Foto JPEG/PNG/WebP, maksimal 10 MB. Tutupi data yang tidak diperlukan."
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setEvidence("");
                      setUploading(true);
                      setUploadError("");
                      try {
                        setEvidence(await upload(file, "purchase_evidence"));
                      } catch (e) {
                        setUploadError((e as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </Field>
                {uploading && <small role="status">Mengunggah foto…</small>}
                {!evidence && !uploading && !uploadError && (
                  <small>
                    Unggah bukti pembelian sebelum mengirim pengajuan.
                  </small>
                )}
                {evidence && (
                  <Badge tone="green">
                    <Check size={12} /> Bukti berhasil diunggah
                  </Badge>
                )}
                {uploadError && (
                  <p className="inline-error" role="alert">
                    {uploadError}
                  </p>
                )}
                <label className="checkbox">
                  <input type="checkbox" required />
                  Saya pembeli pakaian ini dan mengizinkan toko memeriksa bukti
                  yang saya kirim.
                </label>
                <Button
                  type="submit"
                  disabled={uploading}
                  aria-busy={uploading}
                >
                  {uploading ? "Mengunggah bukti…" : "Ajukan verifikasi"}{" "}
                  <ArrowRight size={16} />
                </Button>
              </Form>
            </div>
          ) : (
            <Notice>
              {data.user ? (
                "Pengajuan dilakukan melalui akun pelanggan."
              ) : (
                <>
                  Sudah membeli pakaian ini? <Link href="/login">Masuk</Link>{" "}
                  untuk mengajukan verifikasi.
                </>
              )}
            </Notice>
          )}
          {own.length > 0 && (
            <div className="own-verifications">
              <h3>Pengajuanmu di toko ini</h3>
              {own.map((v) => (
                <div className="simple-row" key={v.id}>
                  <span>{v.reference}</span>
                  <Badge>{statusLabel[v.status]}</Badge>
                  {v.status === "verified" && (
                    <Button
                      className="small secondary"
                      onClick={async () => {
                        try {
                          const existing = data.orders.find(
                            (o) =>
                              o.verificationId === v.id &&
                              o.status !== "cancelled",
                          );
                          if (existing)
                            router.push(`/orders/${existing.id}/tools`);
                          else {
                            const r = await act(
                              "create_order",
                              { verificationId: v.id },
                              "Pesanan jasa dibuat",
                            );
                            router.push(`/orders/${r.id}/tools`);
                          }
                        } catch (e) {
                          setUploadError((e as Error).message);
                        }
                      }}
                    >
                      Pilih bantuan AI <ArrowRight size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <aside>
          <div className="price-panel">
            <div className="eyebrow">ESTIMASI JASA</div>
            <h3>Kenali biayanya dulu.</h3>
            <p>
              Harga contoh prototipe. Penawaran akhir setelah pemeriksaan
              pakaian.
            </p>
            <table className="price-table">
              <thead>
                <tr>
                  <th>Layanan</th>
                  <th>Estimasi</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <small>
                        per {s.unit}
                        {s.review ? " · perlu tinjauan" : ""}
                      </small>
                    </td>
                    <td>
                      {(data.prices[shopId]?.[s.id] ?? s.price) != null
                        ? money((data.prices[shopId]?.[s.id] ?? s.price)!)
                        : "Perlu penawaran"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Notice>
              Bahan, antrean, dan biaya kirim dikonfirmasi dalam penawaran.
              Layanan pembuatan baru belum tersedia.
            </Notice>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AuthPage({
  path,
  data,
  auth,
}: {
  path: string;
  data: Bootstrap;
  auth: (a: string, i: Record<string, unknown>) => Promise<ApiResult>;
}) {
  const register = path === "/register",
    forgot = path === "/forgot-password",
    reset = path === "/reset-password";
  const [message, setMessage] = useState("");
  if (path === "/verify-email")
    return (
      <div className="page-shell">
        <Empty
          title="Periksa emailmu."
          description={
            data.mode === "supabase"
              ? "Buka tautan konfirmasi yang dikirim untuk mengaktifkan akun. Jika tidak ditemukan, periksa folder spam dan konfigurasi email proyek."
              : "Demo lokal tidak mengirim email. Akun yang dibuat dapat digunakan untuk masuk tanpa verifikasi email nyata."
          }
        >
          <Link href="/login" className="button">
            Kembali ke halaman masuk <ArrowRight size={16} />
          </Link>
        </Empty>
      </div>
    );
  return (
    <section className="auth-page">
      <div className="auth-art">
        <img src="/images/hero.jpg" alt="Inspirasi gaya personal" />
        <div>
          <div className="eyebrow">THE PERSONAL EDIT</div>
          <h2>
            Lebih dari pakaian.
            <br />
            <em>Ini tentang kamu.</em>
          </h2>
        </div>
      </div>
      <div className="auth-content">
        <Link className="back-link" href="/">
          <ArrowLeft size={15} /> Kembali ke studio
        </Link>
        <div className="eyebrow">RUANG PERSONALMU</div>
        <h1>
          {register
            ? "Mari berkenalan."
            : forgot
              ? "Kembali ke akunmu."
              : reset
                ? "Kata sandi baru."
                : "Senang bertemu lagi."}
        </h1>
        <p>
          {register
            ? "Buat akun pelanggan dan mulai ceritakan idemu."
            : forgot
              ? "Kami bantu memulihkan akses akunmu."
              : reset
                ? "Gunakan minimal 12 karakter untuk kata sandi baru."
                : "Masuk untuk melanjutkan cerita pakaianmu."}
        </p>
        <Form
          onSubmit={async (f) => {
            const r = await auth(
              register
                ? "register"
                : forgot
                  ? "forgot"
                  : reset
                    ? "reset_password"
                    : "login",
              Object.fromEntries(f),
            );
            if (r.message) setMessage(r.message);
          }}
        >
          {register && (
            <Field label="Nama lengkap">
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                placeholder="Nama kamu"
              />
            </Field>
          )}
          {!reset && (
            <Field label="Alamat email">
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="nama@email.com"
              />
            </Field>
          )}
          {!forgot && (
            <Field label="Kata sandi">
              <input
                type="password"
                name="password"
                required
                minLength={register || reset ? 12 : 1}
                autoComplete={
                  register || reset ? "new-password" : "current-password"
                }
                placeholder={
                  register || reset ? "Minimal 12 karakter" : "Kata sandi kamu"
                }
              />
            </Field>
          )}
          {!register && !forgot && !reset && (
            <Link href="/forgot-password" className="forgot">
              Lupa kata sandi?
            </Link>
          )}
          <Button type="submit" className="full">
            {register
              ? "Buat akun"
              : forgot
                ? "Kirim tautan pemulihan"
                : reset
                  ? "Simpan kata sandi"
                  : "Masuk"}
            <ArrowUpRight size={17} />
          </Button>
        </Form>
        {message && <Notice>{message}</Notice>}
        <p className="auth-switch">
          {register ? (
            <>
              Sudah punya akun? <Link href="/login">Masuk</Link>
            </>
          ) : (
            <>
              Baru di sini? <Link href="/register">Buat akun</Link>
            </>
          )}
        </p>
        {data.demoMenu && !register && !forgot && !reset && (
          <div className="demo-accounts">
            <div className="eyebrow">COBA EMPAT SUDUT PANDANG</div>
            <p>{data.mode === 'supabase' ? 'Pilih peran untuk mencoba aplikasi dengan data yang tersimpan di Supabase.' : 'Pilih peran untuk mencoba aplikasi demo lokal.'}</p>
            <div>
              {[
                ["Pelanggan", "alya@rupa.demo", Users],
                ["Pemilik toko", "toko@rupa.demo", Store],
                ["Penjahit", "penjahit@rupa.demo", Scissors],
                ["Admin", "admin@rupa.demo", Settings2],
              ].map(([label, email, Icon]) => {
                const I = Icon as typeof Users;
                return (
                  <button
                    key={String(email)}
                    onClick={async () => {
                      try {
                        await auth("login", {
                          email,
                          password: "RupaDemo2026!",
                        });
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    <I size={18} />
                    <span>{String(label)}</span>
                    <ArrowUpRight size={14} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Sidebar({ user, section }: { user: User; section: string }) {
  const links =
    user.role === "customer"
      ? [
          ["orders", "Pesanan saya", Package],
          ["verification", "Verifikasi pembelian", CheckCheck],
          ["claims", "Keluhan & garansi", ShieldCheck],
        ]
      : user.role === "merchant"
        ? [
            ["orders", "Pesanan toko", Package],
            ["verification", "Verifikasi pembeli", CheckCheck],
            ["prices", "Harga layanan", ReceiptText],
            ["shops", "Toko & kerja sama", Store],
          ]
        : user.role === "tailor"
          ? [["orders", "Pekerjaan saya", Scissors]]
          : [
              ["orders", "Semua pesanan", Package],
              ["verification", "Verifikasi", CheckCheck],
              ["prices", "Katalog & harga", ReceiptText],
              ["shops", "Toko & mitra", Store],
              ["claims", "Keluhan & garansi", ShieldCheck],
              ["audit", "Riwayat aktivitas", History],
              ["references", "Katalog referensi AI", ImageIcon],
            ];
  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <span className="avatar large">{user.name.slice(0, 1)}</span>
        <strong>{user.name}</strong>
        <small>{roleLabel[user.role]}</small>
      </div>
      <small className="eyebrow">RUANG KERJA</small>
      <nav>
        {links.map(([key, label, Icon]) => {
          const I = Icon as typeof Users;
          return (
            <Link
              key={String(key)}
              className={section === key ? "active" : ""}
              href={`/workspace/${key}`}
            >
              <I size={18} />
              {String(label)}
              <ChevronRight size={14} />
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <Scissors size={21} />
        <strong>Setiap detail punya cerita.</strong>
        <p>Kelola prosesnya dengan jelas, dari ide sampai hasil.</p>
      </div>
      <Link className="sidebar-account" href="/account">
        <LockKeyhole size={16} /> Akun & privasi
      </Link>
    </aside>
  );
}

function Workspace({
  section,
  data,
  act,
  upload,
}: {
  section: string;
  data: Bootstrap;
  act: Actions["act"];
  upload: Actions["upload"];
}) {
  const router = useRouter();
  const user = data.user!;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [err, setErr] = useState("");
  const [newShopFormVersion,setNewShopFormVersion]=useState(0);
  const [shopFilter, setShopFilter] = useState(
    user.shopId || data.shops[0]?.id || "",
  );
  const orders = data.orders.filter(
    (o) =>
      (status === "all" || o.status === status) &&
      `${o.id} ${data.products.find((p) => p.id === o.productId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const titles: Record<string, string> = {
    orders:
      user.role === "customer" ? "Cerita pakaianmu." : "Ruang kerja studio.",
    verification: "Pembelian yang terhubung.",
    prices: "Setiap detail, harga yang jelas.",
    shops: "Tumbuh bersama toko lokal.",
    claims: "Kami dengarkan ceritamu.",
    audit: "Jejak setiap keputusan.",
    references: "Referensi untuk ide pelanggan.",
  };
  const run = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <>
      <div className="workspace-top">
        <div className="eyebrow">
          {roleLabel[user.role].toUpperCase()} / {section.toUpperCase()}
        </div>
        <span className="muted">
          {new Date().toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <div className="workspace-heading">
        <div>
          <h1>{titles[section] || titles.orders}</h1>
          <p>
            {user.role === "customer"
              ? "Dari ide kecil hingga pakaian yang lebih personal."
              : "Satu tempat untuk menjaga proses dan setiap detailnya."}
          </p>
        </div>
        {user.role === "customer" && (
          <Link href="/shops" className="button">
            <Plus size={17} /> Mulai permintaan
          </Link>
        )}
      </div>
      {err && <div className="inline-error">{err}</div>}
      {section === "references" && user.role === "admin" && (
        <ReferenceLibrary data={data} act={act} upload={upload} />
      )}
      {["orders", "verification"].includes(section) &&
        user.role === "customer" && (
          <Notice>
            <strong>
              1. Ajukan pembelian → 2. Toko memverifikasi → 3. Pilih bantuan AI
              atau konsultasi
            </strong>
            <p>
              AI dan konsultasi dibuka setelah pembelian disetujui toko.
              Pengajuan verifikasi belum merupakan pesanan pengerjaan atau
              pembayaran jasa.
            </p>
          </Notice>
        )}
      {section === "orders" &&
        ["customer", "merchant", "admin"].includes(user.role) &&
        data.verifications.some(
          (v) =>
            v.status === "pending" ||
            v.status === "needs_info" ||
            (user.role === "customer" &&
              v.status === "verified" &&
              !data.orders.some(
                (o) => o.verificationId === v.id && o.status !== "cancelled",
              )),
        ) && (
          <div className="panel">
            <h3>
              {user.role === "customer"
                ? "Pengajuan pembelianmu"
                : "Pembelian yang perlu diperiksa"}
            </h3>
            <p>
              {user.role === "customer"
                ? "Periksa status pengajuan sebelum melanjutkan ke bantuan AI dan penjahit."
                : "Permintaan baru masuk ke verifikasi pembelian terlebih dahulu. Periksa nomor transaksi, pakaian, dan bukti pembeli."}
            </p>
            <Link className="button secondary" href="/workspace/verification">
              {user.role === "customer"
                ? "Lihat status & langkah berikutnya"
                : "Periksa pengajuan pembeli"}{" "}
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      {section === "orders" && (
        <>
          <div className="stat-grid">
            {[
              ["Total pesanan", data.orders.length, Package],
              [
                "Sedang berjalan",
                data.orders.filter(
                  (o) => !["completed", "cancelled"].includes(o.status),
                ).length,
                Scissors,
              ],
              [
                "Menunggu persetujuan",
                data.orders.filter(
                  (o) => o.status === "awaiting_quote_approval",
                ).length,
                Clock,
              ],
              [
                "Sudah selesai",
                data.orders.filter((o) => o.status === "completed").length,
                CheckCircle2,
              ],
            ].map(([label, n, Icon]) => {
              const I = Icon as typeof Package;
              return (
                <div className="stat-card" key={String(label)}>
                  <div>
                    <span>{String(label)}</span>
                    <I size={18} />
                  </div>
                  <strong>{String(n).padStart(2, "0")}</strong>
                </div>
              );
            })}
          </div>
          <div className="panel orders-panel">
            <div className="panel-heading">
              <h3>
                {user.role === "tailor"
                  ? "Pekerjaan ditugaskan"
                  : "Daftar pesanan"}
              </h3>
              <div className="table-controls">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    placeholder="Cari pesanan"
                    aria-label="Cari pesanan"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter status pesanan"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Semua status</option>
                  {[...new Set(data.orders.map((o) => o.status))].map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {orders.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PAKAIAN / PESANAN</th>
                      <th>TOKO</th>
                      <th>STATUS</th>
                      <th>ESTIMASI / PENAWARAN</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const p = data.products.find((p) => p.id === o.productId),
                        q = activeQuote(o),
                        est = estimate(data, o);
                      return (
                        <tr
                          key={o.id}
                          onClick={() => router.push(`/orders/${o.id}`)}
                        >
                          <td>
                            <div className="table-product">
                              <img src={p?.image} alt="" />
                              <span>
                                <strong>{p?.name}</strong>
                                <small>
                                  RP-{short(o.id)} · {o.changes.length}{" "}
                                  perubahan
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>
                            {data.shops.find((s) => s.id === o.shopId)?.name}
                          </td>
                          <td>
                            <Badge
                              tone={
                                o.status === "completed" ? "green" : "neutral"
                              }
                            >
                              {statusLabel[o.status]}
                            </Badge>
                          </td>
                          <td>
                            {q
                              ? money(q.total)
                              : est.unknown
                                ? "Perlu penawaran"
                                : money(est.total)}
                            <small>
                              {q
                                ? `Penawaran v${q.version}`
                                : "Estimasi sementara"}
                            </small>
                          </td>
                          <td>
                            <Link
                              href={`/orders/${o.id}`}
                              aria-label={`Buka pesanan ${short(o.id)}`}
                            >
                              <ArrowUpRight size={20} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Cerita baru dimulai dari sini"
                description={
                  user.role === "customer"
                    ? "Pilih toko tempat kamu membeli pakaian, lalu ajukan detail yang ingin diubah."
                    : "Permintaan yang sesuai dengan peranmu akan muncul di sini."
                }
              >
                {user.role === "customer" && (
                  <Link className="button secondary" href="/shops">
                    Jelajahi toko <ArrowRight size={16} />
                  </Link>
                )}
              </Empty>
            )}
          </div>
        </>
      )}
      {section === "verification" && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Permintaan verifikasi</h3>
            <Badge>{data.verifications.length} pengajuan</Badge>
          </div>
          {!data.verifications.length ? (
            <Empty
              title="Belum ada pengajuan"
              description="Bukti pembelian yang diajukan pelanggan akan tampil di sini."
            />
          ) : (
            data.verifications.map((v) => (
              <div className="verification-card" key={v.id}>
                <div className="verification-heading">
                  <div>
                    <small>
                      {v.channel} ·{" "}
                      {data.shops.find((s) => s.id === v.shopId)?.name}
                    </small>
                    <h3>{v.reference}</h3>
                    <p>
                      {data.products.find((p) => p.id === v.productId)?.name}
                    </p>
                  </div>
                  <Badge tone={v.status === "verified" ? "green" : "neutral"}>
                    {statusLabel[v.status]}
                  </Badge>
                </div>
                <a
                  href={`/api/files/${v.evidence}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  <ImageIcon size={15} /> Lihat bukti pembelian
                </a>
                {v.reason && <p className="review-reason">{v.reason}</p>}
                {user.role === "customer" && (
                  <p className="verification-next-step">
                    {v.status === "pending"
                      ? "Menunggu pemilik toko memeriksa bukti pembelian. Pilihan AI dan konsultasi belum terbuka. Status diperbarui otomatis."
                      : v.status === "verified"
                        ? "Pembelian disetujui. Lanjutkan untuk memilih bantuan AI atau berkonsultasi dengan penjahit. Belum ada biaya jasa yang dibayar."
                        : v.status === "needs_info"
                          ? "Toko membutuhkan informasi tambahan. Periksa catatan toko dan hubungi toko melalui kanal pembelian; fitur melengkapi bukti pada pengajuan yang sama belum tersedia."
                          : "Pengajuan ditolak. Periksa alasan toko sebelum mengajukan kembali dengan bukti yang sesuai."}
                  </p>
                )}
                {["admin", "merchant"].includes(user.role) &&
                  v.status !== "verified" && (
                    <Form
                      onSubmit={async (f) =>
                        act(
                          "review_purchase",
                          {
                            id: v.id,
                            status: f.get("status"),
                            reason: f.get("reason"),
                          },
                          "Keputusan verifikasi tersimpan",
                        )
                      }
                    >
                      <div className="form-row">
                        <Field label="Keputusan">
                          <select name="status">
                            <option value="verified">
                              Pembelian dan pemohon sesuai
                            </option>
                            <option value="needs_info">
                              Perlu informasi tambahan
                            </option>
                            <option value="rejected">Tolak pengajuan</option>
                          </select>
                        </Field>
                        <Field label="Catatan pemeriksaan">
                          <input
                            name="reason"
                            required
                            placeholder="Cek nomor, item, dan pemohon pembelian"
                          />
                        </Field>
                      </div>
                      <Button type="submit" className="small">
                        Simpan keputusan <Check size={14} />
                      </Button>
                    </Form>
                  )}
                {user.role === "customer" && v.status === "verified" && (
                  <Button
                    className="small"
                    onClick={() =>
                      run(async () => {
                        const existing = data.orders.find(
                          (o) =>
                            o.verificationId === v.id &&
                            o.status !== "cancelled",
                        );
                        if (existing)
                          router.push(`/orders/${existing.id}/tools`);
                        else {
                          const r = await act("create_order", {
                            verificationId: v.id,
                          });
                          router.push(`/orders/${r.id}/tools`);
                        }
                      })
                    }
                  >
                    Lanjut ke AI & konsultasi <ArrowRight size={15} />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {section === "prices" && ["merchant", "admin"].includes(user.role) && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Harga layanan per toko</h3>
            <select
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
            >
              {data.shops
                .filter((s) => user.role === "admin" || s.id === user.shopId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <Notice>
            Harga contoh untuk estimasi baru. Penawaran yang sudah diterima
            pelanggan tetap menggunakan harga yang disepakati.
          </Notice>
          <div className="price-editor">
            {data.services.map((s) => (
              <Form
                key={`${shopFilter}-${s.id}`}
                onSubmit={(f) =>
                  act(
                    "set_price",
                    {
                      shopId: shopFilter,
                      serviceId: s.id,
                      price: Number(f.get("price")),
                    },
                    "Harga toko diperbarui",
                  )
                }
              >
                <div className="price-edit-row">
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.description}</small>
                  </div>
                  <span>Rp</span>
                  <input
                    name="price"
                    type="number"
                    min={1000}
                    max={10000000}
                    defaultValue={
                      data.prices[shopFilter]?.[s.id] ?? s.price ?? ""
                    }
                    placeholder="Perlu penawaran"
                    required
                    aria-label={`Harga ${s.name}`}
                  />
                  <Button type="submit" className="small secondary">
                    Simpan
                  </Button>
                </div>
              </Form>
            ))}
          </div>
        </div>
      )}
      {section === "shops" && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Toko dan status kerja sama</h3>
            <Badge tone="yellow">Data kerja sama demo</Badge>
          </div>
          {user.role === 'admin' && <details className="verification-card"><summary>Tambah toko baru</summary>
            <p>Toko dibuat nonaktif. Tetapkan penjahit lalu aktifkan ketika siap menerima pesanan.</p>
            <Form key={newShopFormVersion} onSubmit={async f=>{
              await act('create_shop',{name:f.get('name'),city:f.get('city'),category:f.get('category'),description:f.get('description'),...(f.get('tailorId')?{tailorId:f.get('tailorId')}:{})},'Toko baru berhasil ditambahkan');
              setNewShopFormVersion(v=>v+1);
            }}>
              <div className="form-grid">
                <Field label="Nama toko"><input name="name" required minLength={2} maxLength={100}/></Field>
                <Field label="Kota toko"><input name="city" required minLength={2} maxLength={100}/></Field>
                <Field label="Kategori toko"><input name="category" required minLength={2} maxLength={100} placeholder="Contoh: pakaian wanita"/></Field>
                <Field label="Penjahit toko baru"><select name="tailorId" aria-label="Penjahit toko baru" defaultValue=""><option value="">Tetapkan nanti</option>{data.users.filter(u=>u.role==='tailor').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              </div>
              <Field label="Deskripsi toko"><textarea name="description" required minLength={5} maxLength={1000}/></Field>
              <Button type="submit">Simpan toko baru</Button>
            </Form>
          </details>}
          {data.shops
            .filter((s) => user.role === "admin" || s.id === user.shopId)
            .map((s) => (
              <div className="verification-card" key={s.id} data-shop-id={s.id}>
              <div className="simple-row">
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {s.city} · {s.approved ? "Disetujui" : "Belum disetujui"}
                  </small>
                </span>
                <Badge tone={s.active ? "green" : "neutral"}>
                  {s.active ? "Aktif (demo)" : "Tidak aktif"}
                </Badge>
                {user.role === "admin" && (
                  <Button
                    className="small secondary"
                    disabled={!s.active&&!s.tailorId}
                    onClick={() =>
                      run(() =>
                        act("set_shop", { shopId: s.id, active: !s.active }),
                      )
                    }
                  >
                    {s.active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                )}
              </div>
              <p>Penjahit toko: <strong>{data.users.find(u=>u.id===s.tailorId)?.name || 'Belum ditetapkan'}</strong></p>
              {user.role==='admin' && <Form onSubmit={f=>act('assign_shop_tailor',{shopId:s.id,tailorId:f.get('tailorId')},'Penjahit toko diperbarui untuk pesanan baru')}>
                <Field label={`Penjahit untuk ${s.name}`}><select name="tailorId" aria-label={`Penjahit untuk ${s.name}`} defaultValue={s.tailorId||''} key={s.tailorId||'none'} required><option value="" disabled>Pilih penjahit toko</option>{data.users.filter(u=>u.role==='tailor').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                <Button type="submit" className="small secondary">Simpan penjahit toko</Button>
                <small>Penugasan ini dipakai pesanan baru. Penjahit pesanan lama tetap sampai diubah dari detail pesanan.</small>
              </Form>}
              </div>
            ))}
          <Notice>
            Aktivasi ini mencatat status prototipe, bukan penerimaan uang
            langganan toko.
          </Notice>
          {user.role === "admin" && (
            <>
              <h3 className="top-gap">Mitra penjahit</h3>
              {data.users
                .filter((u) => u.role === "tailor")
                .map((u) => (
                  <div className="simple-row" key={u.id}>
                    <span className="avatar">{u.name[0]}</span>
                    <span>
                      <strong>{u.name}</strong>
                      <small>{data.shops.filter(s=>s.tailorId===u.id).map(s=>s.name).join(', ')||'Belum ditugaskan ke toko'}</small>
                    </span>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
      {section === "claims" && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Keluhan dan garansi</h3>
          </div>
          {!data.claims.length ? (
            <Empty
              title="Belum ada keluhan"
              description="Ajukan keluhan dari detail pesanan yang sudah dikirim."
            />
          ) : (
            data.claims.map((c) => (
              <div key={c.id} className="verification-card">
                <div className="verification-heading">
                  <Link href={`/orders/${c.orderId}`} className="text-link">
                    RP-{short(c.orderId)} <ArrowUpRight size={14} />
                  </Link>
                  <Badge>{statusLabel[c.status]}</Badge>
                </div>
                <p>{c.description}</p>
                {c.response && <Notice>{c.response}</Notice>}
                {user.role === "admin" && (
                  <Form
                    onSubmit={(f) =>
                      act("review_claim", {
                        id: c.id,
                        status: f.get("status"),
                        response: f.get("response"),
                      })
                    }
                  >
                    <Field label="Status penanganan">
                      <select name="status">
                        <option value="under_review">Sedang ditinjau</option>
                        <option value="resolution_in_progress">
                          Penyelesaian berlangsung
                        </option>
                        <option value="resolved">
                          Penyelesaian sudah dilaksanakan
                        </option>
                        <option value="declined">Ditolak dengan alasan</option>
                      </select>
                    </Field>
                    <Field label="Respons dan bukti penyelesaian">
                      <textarea name="response" required minLength={5} />
                    </Field>
                    <Button type="submit">Simpan respons</Button>
                  </Form>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {section === "audit" && user.role === "admin" && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Riwayat aktivitas</h3>
          </div>
          {data.audit.length ? (
            [...data.audit].reverse().map((a) => (
              <div className="audit-row" key={a.id}>
                <History size={16} />
                <div>
                  <strong>{a.action}</strong>
                  <p>{a.detail}</p>
                  <small>
                    {date(a.at)} ·{" "}
                    {data.users.find((u) => u.id === a.actor)?.name || a.actor}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="Belum ada aktivitas"
              description="Perubahan penting dicatat setelah dilakukan."
            />
          )}
        </div>
      )}
    </>
  );
}

function ReferenceLibrary({
  data,
  act,
  upload,
}: {
  data: Bootstrap;
  act: Actions["act"];
  upload: Actions["upload"];
}) {
  const [photo, setPhoto] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <div className="panel">
        <h3>Tambahkan foto referensi berizin</h3>
        <p>
          Gambar di katalog ini dapat dilihat pelanggan untuk mencari inspirasi.
          Foto pesanan pelanggan tidak otomatis masuk katalog. Label warna,
          motif, jenis pakaian, dan posisi menentukan kecocokan pencarian.
        </p>
        <Form
          onSubmit={async (f) => {
            if (!photo)
              throw new Error("Unggah foto referensi terlebih dahulu");
            await act(
              "add_reference",
              {
                assetId: photo,
                name: f.get("name"),
                attributes: String(f.get("attributes"))
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
                source: f.get("source"),
                rightsConfirmed: true,
              },
              "Referensi ditambahkan ke katalog",
            );
            setPhoto("");
          }}
        >
          <Field label="Nama referensi">
            <input
              name="name"
              minLength={3}
              maxLength={200}
              required
              placeholder="Kaos merah dengan logo tengkorak di tengah"
            />
          </Field>
          <Field label="Label pencarian, pisahkan dengan koma">
            <input
              name="attributes"
              required
              placeholder="kaos, merah, tengkorak, tengah"
            />
          </Field>
          <Field label="Sumber dan izin penggunaan">
            <input
              name="source"
              required
              minLength={5}
              maxLength={500}
              placeholder="Foto milik studio; diizinkan untuk katalog inspirasi"
            />
          </Field>
          <Field label="Gambar katalog">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPhoto("");
                setUploading(true);
                setError("");
                try {
                  setPhoto(await upload(file, "reference_catalog"));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </Field>
          {uploading && <p role="status">Mengunggah referensi…</p>}
          {photo && <Badge tone="green">Foto referensi tersimpan</Badge>}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <label className="checkbox">
            <input type="checkbox" required /> Saya memiliki izin untuk
            menampilkan gambar ini dalam katalog layanan; ini bukan foto pribadi
            pelanggan tanpa izin.
          </label>
          <Button type="submit" disabled={uploading}>
            Simpan referensi
          </Button>
        </Form>
      </div>
      <div className="panel">
        <h3>Katalog referensi ({data.referenceDesigns?.length || 0})</h3>
        <p>
          Foto katalog berasal dari dataset berizin dan unggahan admin. Gambar ini bukan bukti hasil jasa jahit.
        </p>
        <div className="reference-grid">
          {(data.referenceDesigns || []).map((r) => (
            <a key={r.id} href={r.image} target="_blank" rel="noreferrer">
              <img src={r.image} alt={r.name} />
              <strong>{r.name}</strong>
              <small>
                {r.kind === "illustration"
                  ? "Sketsa ilustrasi"
                  : "Foto referensi"}{" "}
                · {r.attributes.join(", ")}
              </small>
              <small>{r.source}</small>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

function FilePicker({
  orderId,
  purpose,
  upload,
  onUploaded,
}: {
  orderId: string;
  purpose: string;
  upload: Actions["upload"];
  onUploaded: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <Field
      label={
        purpose === "intake"
          ? "Foto kondisi saat diterima"
          : purpose === "qc"
            ? "Foto hasil pengerjaan"
            : "Foto pakaian"
      }
      hint="JPEG, PNG, atau WebP. Maksimal 10 MB, disimpan privat."
    >
      <div className="upload-box">
        <Upload size={19} />
        <input
          type="file"
          aria-label="Unggah foto pakaian"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            onUploaded("");
            setDone(false);
            setBusy(true);
            setError("");
            try {
              onUploaded(await upload(f, purpose, orderId));
              setDone(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        {busy ? (
          <small>Mengunggah…</small>
        ) : done ? (
          <Badge tone="green">Foto tersimpan</Badge>
        ) : (
          <small>Foto yang jelas membantu komunikasi.</small>
        )}
      </div>
      {error && <span className="inline-error">{error}</span>}
    </Field>
  );
}

function OrderDetail({
  order,
  initialSection,
  data,
  act,
  upload,
  notify,
  refresh,
}: Actions & {
  order: Order;
  initialSection: string;
  data: Bootstrap;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const user = data.user!,
    owner = user.role === "customer",
    admin = user.role === "admin",
    tailor = user.role === "tailor",
    merchant = user.role === "merchant";
  const shop = data.shops.find((s) => s.id === order.shopId),
    product = data.products.find((p) => p.id === order.productId);
  const q = activeQuote(order),
    est = estimate(data, order);
  const initialTab =
    initialSection === "consultation" && !merchant
      ? "chat"
      : ["quote", "payment"].includes(initialSection)
        ? "quote"
        : initialSection === "journey"
          ? "journey"
          : initialSection === "manage" && (admin || tailor)
            ? "manage"
            : "changes";
  const [tab, setTab] = useState(initialTab),
    [mode, setMode] = useState(
      initialSection === "measurements" ? "measurements" : "design",
    ),
    [service, setService] = useState(
      initialSection === "measurements" ? "waist" : "pocket",
    ),
    [editing, setEditing] = useState<Change | null>(null),
    [photo, setPhoto] = useState(
      () =>
        order.designMarkup?.assetId || [...data.assets]
          .reverse()
          .find(
            (a) =>
              a.orderId === order.id &&
              a.ownerId === user.id &&
              a.purpose === "garment",
          )?.id || "",
    ),
    [markup, setMarkup] = useState<DesignMarkup>(order.designMarkup?.markup || {strokes:[]}),
    [intakePhoto, setIntakePhoto] = useState(""),
    [qcPhoto, setQcPhoto] = useState(""),
    [error, setError] = useState(""),
    [paymentBusy, setPaymentBusy] = useState(false);
  const selected = data.services.find((s) => s.id === service)!;
  const editable = owner && ["draft", "consultation"].includes(order.status);
  const messages = data.messages.filter((m) => m.orderId === order.id);
  const chatContact = data.users.find(
    (u) => u.id === (tailor ? order.customerId : order.tailorId),
  );
  const chatContactName =
    chatContact?.name || (tailor ? "Pelanggan" : "Operator Rupa");
  const payments = data.payments.filter((p) => p.orderId === order.id);
  const currentPayment = [...payments]
    .reverse()
    .find((p) => p.quoteId === q?.id);
  const jobs = [...data.jobs].reverse().filter(j=>j.orderId===order.id && (mode === "measurements" ? j.mode === "measurements" : ["design","preview"].includes(j.mode) && (!editable || j.engine === "catalog" || j.engine === "sdxl"))).slice(0,1);
  const draft = [...order.quotes].reverse().find((q) => q.status === "draft");
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const changeForm = (<Form
                      key={`${editing?.id || "new"}-${mode}`}
                      onSubmit={async (f) => {
                        const measurements: Record<string, number> = {};
                        if (mode === "measurements")
                          for (const k of selected.measurements || [])
                            measurements[k] = Number(f.get(`m:${k}`));
                        await act(
                          "save_change",
                          {
                            orderId: order.id,
                            id: editing?.id,
                            serviceId: service,
                            description: f.get("description"),
                            position: f.get("position"),
                            quantity: Number(f.get("quantity")),
                            measurements,
                            mode,
                          },
                          "Detail perubahan ditambahkan",
                        );
                        setEditing(null);
                      }}
                    >
                      <div className="form-row">
                        <Field label="Jenis perubahan">
                          <select
                            name="service"
                            value={service}
                            onChange={(e) => setService(e.target.value)}
                          >
                            {data.services
                              .filter(
                                (s) =>
                                  (mode !== "measurements" ||
                                    !!s.measurements?.length) &&
                                  ![
                                    "bespoke",
                                    "formal",
                                    "mending",
                                    "shoulder",
                                  ].includes(s.id),
                              )
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label={`Jumlah (${selected.unit})`}>
                          <input
                            type="number"
                            name="quantity"
                            min={1}
                            max={10}
                            required
                            defaultValue={editing?.quantity || 1}
                          />
                        </Field>
                      </div>
                      <Field
                        label="Posisi pada pakaian"
                        hint="Kiri/kanan mengikuti sisi pemakai, bukan sisi foto."
                      >
                        <input
                          name="position"
                          required
                          minLength={2}
                          defaultValue={editing?.position}
                          placeholder="Contoh: sisi kiri pemakai, dekat pinggang"
                        />
                      </Field>
                      <Field label="Ceritakan detail yang kamu inginkan">
                        <textarea
                          required
                          name="description"
                          minLength={3}
                          defaultValue={editing?.description}
                          placeholder="Contoh: satu kantong tersembunyi agar gaun tetap terlihat sederhana."
                        />
                      </Field>
                      {mode === "measurements" && (
                        <>
                          <Notice>
                            Masukkan ukuran pakaian, bukan tebakan dari tinggi
                            atau berat badan. Jika belum yakin, konsultasikan
                            metode ukur kepada penjahit. Tidak ada jaminan fit
                            otomatis.
                          </Notice>
                          {(selected.measurements || []).length ? (
                            <div className="form-row">
                              {selected.measurements?.map((k) => (
                                <Field key={k} label={`${k} (cm)`}>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max="500"
                                    required
                                    name={`m:${k}`}
                                    defaultValue={editing?.measurements[k]}
                                  />
                                </Field>
                              ))}
                            </div>
                          ) : (
                            <p className="muted">
                              Ukuran untuk pekerjaan ini ditentukan bersama
                              penjahit di konsultasi. Tuliskan ukuran yang
                              diketahui dalam deskripsi.
                            </p>
                          )}
                        </>
                      )}
                      <div className="form-actions">
                        <Button type="submit">
                          <Plus size={16} />
                          {editing ? "Simpan perubahan" : "Tambah perubahan"}
                        </Button>
                        {editing && (
                          <Button
                            className="secondary"
                            onClick={() => setEditing(null)}
                          >
                            Batal edit
                          </Button>
                        )}
                      </div>
                    </Form>);
  const resultPanel = (jobs.length > 0 && (
              <div className="panel ai-results">
                <h3>Hasil pendampingan</h3>
                <p>
                  Ilustrasi AI belum menjadi instruksi
                  pengerjaan. Simpan detail yang dipilih ke daftar perubahan dan
                  konfirmasikan dengan penjahit.
                </p>
                {[...jobs].reverse().map((j) => (
                  <div key={j.id} className="ai-result">
                    <div className="simple-row">
                      <Badge
                        tone={
                          j.status === "failed" || j.previewError
                            ? "yellow"
                            : j.status === "succeeded"
                              ? "green"
                              : "neutral"
                        }
                      >
                        {j.previewError ? "Analisis selesai · gambar gagal" : statusLabel[j.status]}
                      </Badge>
                      <small>Spesifikasi v{j.specVersion}</small>
                      {j.model && <small>{j.model}</small>}
                    </div>
                    {j.markup && j.baseAssetId && <details><summary>Lihat area pada permintaan ini</summary><DesignMarkupEditor photo={j.baseAssetId} value={j.markup} readOnly/></details>}
                    {j.model?.includes("sketch-guided hybrid") && <p className="muted">Ilustrasi hibrida: sistem membuat sketsa tata letak saku dari area yang ditandai, kemudian SDXL merender ulang gambar. Bentuk dibantu sketsa; tekstur dan kelayakan jahitan perlu dikonfirmasi dengan penjahit.</p>}
                    {j.error ? (
                      <p>{j.error}</p>
                    ) : j.status === "queued" || j.status === "running" ? (
                      <p>
                        <Loader2 className="spin" size={15} /> AI sedang memproses.
                        {j.result || "Membuat variasi ilustrasi. Status diperbarui berkala."}
                      </p>
                    ) : (
                      <>
                        {j.mode === "measurements" && <pre>{j.result}</pre>}
                        {j.generation === "text" && j.assetId && <figure><img className="preview-image" src={`/api/files/${j.assetId}`} alt="Konsep pakaian dari teks"/><figcaption>Konsep baru dari teks · bukan edit foto atau hasil jahitan</figcaption></figure>}
                        {["design", "preview"].includes(j.mode) && j.baseAssetId && ((j.assetId && j.assetId !== j.baseAssetId) || j.references?.some(r => r.id === j.selectedReferenceId)) && (
                          <div className="design-comparison">
                            {j.baseAssetId && (
                              <figure>
                                <img
                                  className="preview-image"
                                  src={`/api/files/${j.baseAssetId}`}
                                  alt="Foto pakaian awal"
                                />
                                <figcaption>
                                  Desain awal · foto yang diunggah
                                </figcaption>
                              </figure>
                            )}
                            <figure>
                              <img
                                className="preview-image"
                                src={j.references?.find(r => r.id === j.selectedReferenceId)?.image || `/api/files/${j.assetId}`}
                                alt="Desain pilihan untuk konsultasi, bukan hasil jahitan"
                              />
                              <figcaption>
                                {j.references?.some(r => r.id === j.selectedReferenceId)
                                  ? "Referensi pilihan - gambar katalog, bukan edit foto pakaian"
                                  : j.model?.includes("sketch-guided hybrid") ? "Usulan perubahan · ilustrasi hibrida sketsa + AI, bukan hasil jahitan" : "Usulan perubahan - ilustrasi AI, bukan hasil jahitan"}
                              </figcaption>
                            </figure>
                          </div>
                        )}
                        {j.previewError && <Notice><strong>Gambar pratinjau belum tersedia.</strong><p>{j.previewError}</p><p>Instruksi yang diterima: {j.prompt}</p><button type="button" className="button secondary small" onClick={()=>{setTab("chat");router.push(`/orders/${order.id}/consultation`);}}>Lanjut konsultasi dengan penjahit</button></Notice>}
                        {["design", "preview"].includes(j.mode) && (
                          <div className="design-options">
                            {editable && !j.variants?.length && j.engine !== "catalog" && j.assetId && j.assetId !== j.baseAssetId && <Form onSubmit={async () => {
                              await act("select_ai_design", { orderId: order.id, jobId: j.id, referenceId: "generated" }, "Pilihan desain dikirim ke konsultasi");
                            }}>
                              <Button type="submit" className="secondary small">{j.selectedReferenceId === "generated" ? "Terpilih untuk konsultasi" : j.selectedReferenceId ? "Kembali ke hasil AI" : "Pilih hasil desain ini"}</Button>
                            </Form>}
                            {editable && j.engine === "sdxl" && <Form onSubmit={async () => {
                              await request("/api/ai", { orderId: order.id, mode: j.generation === "text" ? "preview" : "design", prompt: j.prompt, assetId: j.baseAssetId, region: j.region, markup: j.markup, engine: "sdxl", generation: j.generation || "inpaint" });
                              await refresh(); notify("Alternatif desain sedang dibuat");
                            }}><Button type="submit" className="secondary small">Buat 3 variasi baru</Button></Form>}
                            {j.editInstruction && !j.variants?.some(v=>v.label) && <p className="muted">Deskripsi untuk model gambar: {j.editInstruction}</p>}
                            {!!j.variants?.length && <div className="generated-variants" aria-label="Variasi ilustrasi AI" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:16,width:"100%"}}>
                              {j.variants.map((v,index)=><figure key={v.assetId} style={{margin:0}}><img className="preview-image" src={`/api/files/${v.assetId}`} alt={`Ilustrasi variasi ${index+1}${v.label?`: ${v.label}`:""}`}/><figcaption>Variasi {index+1}{v.label?` · ${v.label}`:""} · {j.model?.includes("sketch-guided hybrid") ? "sketsa + AI" : "ilustrasi AI"}</figcaption>{v.label&&v.instruction&&<details><summary>Instruksi desain ini</summary><p className="muted">{v.instruction}</p></details>}{editable && <Form onSubmit={async()=>{await act("select_ai_design",{orderId:order.id,jobId:j.id,referenceId:`generated:${v.assetId}`},"Variasi dikirim ke konsultasi");}}><Button type="submit" className="secondary small">{j.selectedReferenceId===`generated:${v.assetId}`?"Terpilih untuk konsultasi":`Pilih variasi ${index+1}`}</Button></Form>}</figure>)}
                            </div>}
                            {j.selectedReferenceId && <p role="status">Pilihan gambar tersimpan dan dikirim ke ruang Konsultasi. Lengkapi jenis, posisi, dan jumlah perubahan pada formulir sebelum menyepakati pengerjaan.</p>}
                            <details><summary>Saran dan hasil analisis</summary><pre>{j.result}</pre></details>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ));
  return (
    <div className="page-shell order-page">
      <Link className="back-link" href="/workspace">
        <ArrowLeft size={15} /> Kembali ke pesanan
      </Link>
      <div className="order-heading">
        <div>
          <div className="eyebrow">
            {shop?.name.toUpperCase()} / RP-{short(order.id)}
          </div>
          <h1>
            Satu pakaian.
            <br />
            <em>Cerita yang lebih personal.</em>
          </h1>
        </div>
        <Badge tone={order.status === "completed" ? "green" : "yellow"}>
          {statusLabel[order.status]}
        </Badge>
      </div>
      <div className="order-summary">
        <img src={product?.image} alt={product?.name || "Pakaian"} />
        <div>
          <small>PAKAIAN YANG AKAN DIUBAH</small>
          <h3>{product?.name}</h3>
          <p>
            {product?.sku} · {product?.material}
          </p>
        </div>
        <div className="order-summary-right">
          <Badge tone="green">
            <Check size={12} /> Pembelian terverifikasi
          </Badge>
          <small>
            {order.changes.length} perubahan · spesifikasi v{order.specVersion}
          </small>
        </div>
      </div>
      <div className="order-tabs">
        {[
          ["changes", "Bantuan AI & Perubahan", Sparkles],
          ...(!merchant ? [["chat", "Konsultasi", MessageCircle]] : []),
          ["quote", "Penawaran", ReceiptText],
          ["journey", "Perjalanan", Package],
          ...(admin || tailor
            ? [["manage", "Kelola pengerjaan", Scissors]]
            : []),
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof Sparkles;
          return (
            <button
              key={String(key)}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(String(key));
                router.push(
                  `/orders/${order.id}/${key === "chat" ? "consultation" : key === "changes" ? "tools" : String(key)}`,
                );
              }}
            >
              <I size={16} />
              {String(label)}
              {key === "chat" && messages.length > 0 && (
                <span>{messages.length}</span>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {tab === "changes" && (
        <div className="order-grid">
          <section>
            {!merchant && order.designMarkup && (!editable || !owner) && <div className="panel">
              <DesignMarkupEditor photo={order.designMarkup.assetId} value={order.designMarkup.markup} readOnly/>
              <p>Penanda untuk konsultasi. Konfirmasikan detail dan kelayakan sebelum pengerjaan.</p>
            </div>}
            {editable && (
              <>
                <div className="eyebrow">PILIH MODE BANTUAN AI</div>
                <p>
                  Pembelian sudah diverifikasi. Pilih salah satu bantuan di
                  bawah, atau buka tab Konsultasi untuk berdiskusi dengan
                  penjahit. Kamu bisa menggunakan beberapa mode dalam satu
                  pesanan.
                </p>
                {!data.integrations.ai && (
                  <Notice>
                    Mesin AI belum terhubung pada prototipe ini. Pilihan mode
                    dan pengisian detail bisa digunakan; rekomendasi otomatis
                    dan gambar pratinjau belum dapat dihasilkan. Konsultasi
                    dengan penjahit tetap tersedia.
                  </Notice>
                )}
                {data.integrations.ai && !data.integrations.aiHealth?.ok && (
                  <Notice>
                    Pendamping AI sedang tidak tersedia. Form
                    perubahan dan konsultasi tetap dapat digunakan.
                  </Notice>
                )}
                {data.integrations.aiHealth?.ok && (mode === "measurements" ? !data.integrations.aiHealth.analysis_ready : !data.integrations.aiHealth.sdxl_ready || !data.integrations.aiHealth.controlnet_ready) && <Notice>Model untuk mode ini belum siap. Form perubahan dan konsultasi tetap tersedia.</Notice>}
                <div className="mode-grid combined-modes">
                  {[
                    [
                      "design",
                      "Desain & Pratinjau",
                      "Tandai area dan tentukan detail. Untuk saku terarah, bandingkan model terbuka, penutup, dan lipit tengah.",
                      Sparkles,
                    ],
                    [
                      "measurements",
                      "Bantu Sesuaikan Ukuran",
                      "Fokus pada ukuran pakaian yang ingin diubah.",
                      Ruler,
                    ],
                  ].map(([key, title, desc, Icon]) => {
                    const I = Icon as typeof Sparkles;
                    return (
                      <button
                        key={String(key)}
                        className={`mode-card ${mode === key ? "active" : ""}`}
                        onClick={() => {
                          setMode(String(key));
                          setEditing(null);
                          router.push(`/orders/${order.id}/${String(key)}`);
                        }}
                      >
                        <I size={23} />
                        <strong>{String(title)}</strong>
                        <p>{String(desc)}</p>
                        <span>
                          {mode === key ? (
                            <Check size={15} />
                          ) : (
                            <ArrowUpRight size={15} />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {mode === "design" ? <>
                  <NumberedDesignWorkspace photo={photo} value={markup} onChange={setMarkup} ready={!!(data.integrations.aiHealth?.sdxl_ready && data.integrations.aiHealth?.controlnet_ready && data.integrations.aiHealth?.analysis_ready)}
                    uploadSlot={<FilePicker orderId={order.id} purpose="garment" upload={upload} onUploaded={id=>{setPhoto(id);setMarkup({strokes:[]});}}/>}
                    onSave={async value=>{await act("save_design_markup",{orderId:order.id,assetId:photo,markup:value},"Detail dan penanda tersimpan");}}
                    onSubmit={async value=>{
                      await act("save_design_markup",{orderId:order.id,assetId:photo,markup:value},"Detail dan penanda tersimpan");
                      await request("/api/ai",{orderId:order.id,mode:"design",engine:"sdxl",generation:"inpaint",assetId:photo,markup:value,prompt:value.details?.map((d,i)=>`${i+1}. ${d.text}`).join("\n")});
                      await refresh();notify("Pratinjau perubahan sedang dibuat");
                    }}
                    onConcept={async prompt=>{
                      await request("/api/ai",{orderId:order.id,mode:"preview",engine:"sdxl",generation:"text",prompt});
                      await refresh();notify("Konsep pakaian sedang dibuat");
                    }}>
                    {resultPanel || <div className="panel empty-design-result"><h3>Hasil AI</h3><p>Tiga variasi ilustrasi akan muncul di sini setelah diproses.</p></div>}
                  </NumberedDesignWorkspace>
                  <details className="panel service-details"><summary>Rincian layanan untuk penjahit</summary>{changeForm}</details>
                </> : <div className="panel change-form">
                  <h3>Bantu sesuaikan ukuran</h3>
                  <p>Isi dan simpan ukuran pada rincian perubahan, kemudian minta saran ukuran.</p>
                  <Form onSubmit={async f=>{await request("/api/ai",{orderId:order.id,mode:"measurements",prompt:String(f.get("prompt")),assetId:photo||undefined,engine:"diffusion"});await refresh();notify("Saran ukuran diperbarui");}}>
                    <Field label="Pertanyaan tentang ukuran"><textarea name="prompt" minLength={5} required/></Field>
                    <Button type="submit">Minta saran ukuran</Button>
                  </Form>
                  {changeForm}
                </div>}
              </>
            )}
            {(mode !== "design" || !editable) && resultPanel}
            {!editable && (
              <div className="panel">
                <h3>Spesifikasi perubahan</h3>
                <p className="muted">
                  Permintaan sudah masuk proses pemeriksaan atau pengerjaan.
                  Hubungi penjahit untuk mengusulkan perubahan baru.
                </p>
              </div>
            )}
            {order.changes.map((c, i) => (
              <div className="change-item" key={c.id}>
                <span className="change-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="simple-row">
                    <h3>
                      {data.services.find((s) => s.id === c.serviceId)?.name}
                    </h3>
                    <Badge>{c.quantity} ×</Badge>
                  </div>
                  <strong>{c.position}</strong>
                  <p>{c.description}</p>
                  {Object.entries(c.measurements).map(([k, v]) => (
                    <small className="measurement" key={k}>
                      {k}: {v} cm
                    </small>
                  ))}
                </div>
                {editable && (
                  <div className="change-actions">
                    <button
                      onClick={() => {
                        setEditing(c);
                        setService(c.serviceId);
                        setMode(c.mode);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      aria-label="Hapus perubahan"
                      onClick={() =>
                        run(() =>
                          act("remove_change", { orderId: order.id, id: c.id }),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!order.changes.length && !editable && (
              <Empty
                title="Belum ada perubahan"
                description="Pelanggan belum mengisi detail perubahan."
              />
            )}
          </section>
          <aside className="order-aside">
            <div className="price-panel">
              <div className="eyebrow">SATU PAKAIAN, SATU PERMINTAAN</div>
              <h3>Ringkasan perubahan</h3>
              <p>
                {order.changes.length} detail yang ingin dibuat lebih personal.
              </p>
              {order.changes.map((c) => {
                const s = data.services.find((s) => s.id === c.serviceId)!;
                const price = data.prices[order.shopId]?.[s.id] ?? s.price;
                return (
                  <div className="estimate-row" key={c.id}>
                    <span>
                      {s.name}
                      <small>
                        {c.quantity} {s.unit}
                      </small>
                    </span>
                    <strong>
                      {price == null ? "Ditinjau" : money(price * c.quantity)}
                    </strong>
                  </div>
                );
              })}
              <div className="estimate-total">
                <span>
                  {est.unknown ? "Subtotal diketahui" : "Estimasi awal"}
                </span>
                <strong>{money(est.total)}</strong>
              </div>
              <Notice>
                Belum termasuk biaya yang belum ditentukan. Harga dan waktu
                akhir ditetapkan setelah pakaian diperiksa.
              </Notice>
              {editable && order.changes.length > 0 && (
                <Form
                  onSubmit={() =>
                    act(
                      "authorize_intake",
                      { orderId: order.id, consent: true },
                      "Permintaan pemeriksaan dikirim",
                    )
                  }
                >
                  <label className="checkbox">
                    <input type="checkbox" required />
                    Saya mengizinkan pemeriksaan saja, belum pemotongan. Pada
                    demo ini pengiriman fisik dan biayanya disimulasikan, tanpa
                    uang nyata.
                  </label>
                  <Button type="submit" className="full">
                    Ajukan pemeriksaan <ArrowRight size={16} />
                  </Button>
                </Form>
              )}
              {!merchant && (
                <Button
                  className="secondary full"
                  onClick={() => setTab("chat")}
                >
                  <MessageCircle size={16} /> Konsultasi dengan penjahit
                </Button>
              )}
              <div className="tailor-mini">
                <span className="avatar">R</span>
                <span>
                  <strong>
                    {data.users.find((u) => u.id === order.tailorId)?.name ||
                      "Menunggu penugasan"}
                  </strong>
                  <small>Mitra penjahit yang ditugaskan</small>
                </span>
              </div>
              {owner &&
                ["draft", "consultation", "awaiting_intake"].includes(
                  order.status,
                ) && (
                  <Button
                    className="quiet full"
                    onClick={() =>
                      run(() =>
                        act(
                          "cancel_order",
                          { orderId: order.id },
                          "Pengajuan dibatalkan",
                        ),
                      )
                    }
                  >
                    Batalkan pengajuan
                  </Button>
                )}
            </div>
          </aside>
        </div>
      )}
      {tab === "chat" && !merchant && (
        <div className="chat-layout">
          <div className="chat-main panel">
            <div className="chat-header">
              <span className="avatar">{chatContactName[0]}</span>
              <div>
                <strong>{chatContactName}</strong>
                <small>Konsultasi langsung · diperbarui tiap 12 detik</small>
              </div>
              <Badge>Privat</Badge>
            </div>
            <div className="chat-messages">
              {!messages.length && (
                <Empty
                  title="Mulai dari satu pertanyaan."
                  description="Ceritakan idemu, tanyakan ukuran atau bahan yang diperlukan. Percakapan belum merupakan persetujuan pengerjaan."
                />
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`message ${m.senderId === user.id ? "mine" : ""}`}
                >
                  <small>
                    {m.senderName} · {roleLabel[m.role]}
                  </small>
                  <p>{m.body}</p>
                  <time>{date(m.createdAt)}</time>
                </div>
              ))}
            </div>
            <Form
              className="chat-composer"
              onSubmit={async (f) => {
                await act(
                  "send_message",
                  { orderId: order.id, body: f.get("body") },
                  "Pesan terkirim",
                );
              }}
            >
              <input
                name="body"
                required
                maxLength={3000}
                placeholder="Tulis pertanyaan atau detail perubahan…"
                aria-label="Pesan konsultasi"
              />
              <Button type="submit" aria-label="Kirim pesan">
                <Send size={18} />
              </Button>
            </Form>
          </div>
          <aside className="chat-aside">
            <ShieldCheck size={25} />
            <h3>Bicarakan sampai jelas.</h3>
            <p>
              Sepakati posisi, bahan, dan ukuran yang diperlukan. Persetujuan
              desain dan biaya tetap dilakukan di halaman penawaran.
            </p>
            <Notice>
              Chat tidak meminta kata sandi atau pembayaran di luar halaman
              pembayaran.
            </Notice>
          </aside>
        </div>
      )}
      {tab === "quote" && (
        <div className="quote-layout">
          <div className="panel quote-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">SEBELUM MULAI DIKERJAKAN</div>
                <h2>
                  Semua detail,
                  <br />
                  <em>disepakati bersama.</em>
                </h2>
              </div>
              {q && <Badge>Versi {q.version}</Badge>}
            </div>
            {!q ? (
              <Empty
                title={
                  draft
                    ? "Penawaran menunggu operator"
                    : "Penawaran belum tersedia"
                }
                description={
                  draft
                    ? "Penjahit telah mengusulkan rincian. Operator akan memeriksa sebelum menerbitkannya."
                    : "Setelah pakaian diperiksa, penjahit dan operator menyusun biaya serta estimasi waktu."
                }
              />
            ) : (
              <>
                <table className="quote-table">
                  <thead>
                    <tr>
                      <th>Pekerjaan</th>
                      <th>Jumlah</th>
                      <th>Biaya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.items.map((i, n) => (
                      <tr key={n}>
                        <td>{i.label}</td>
                        <td>{i.quantity}</td>
                        <td>{money(i.quantity * i.unitPrice)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Bahan tambahan (belum termasuk)</td>
                      <td />
                      <td>{money(q.materials)}</td>
                    </tr>
                    <tr>
                      <td>Pengiriman yang dibebankan</td>
                      <td />
                      <td>{money(q.shipping)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="quote-total">
                  <span>Total penawaran</span>
                  <strong>{money(q.total)}</strong>
                </div>
                <div className="quote-details">
                  <div>
                    <Clock size={17} />
                    <span>
                      Estimasi pengerjaan<strong>{q.days} hari kerja</strong>
                    </span>
                  </div>
                  <div>
                    <ReceiptText size={17} />
                    <span>
                      Berlaku sampai<strong>{date(q.expiresAt)}</strong>
                    </span>
                  </div>
                </div>
                <Notice>
                  Waktu mulai setelah pembayaran terverifikasi, bahan siap, dan
                  operator melepas pekerjaan. Waktu antre serta pengiriman
                  dikonfirmasi terpisah.
                </Notice>
                <h3>Catatan teknis & spesifikasi</h3>
                <p className="preserve">{q.notes}</p>
                {q.specSnapshot.map((c) => (
                  <div className="quote-spec" key={c.id}>
                    <strong>
                      {data.services.find((s) => s.id === c.serviceId)?.name} ·{" "}
                      {c.position}
                    </strong>
                    <p>{c.description}</p>
                    {Object.entries(c.measurements).map(([k, v]) => (
                      <small key={k}>
                        {k}: {v} cm
                        <br />
                      </small>
                    ))}
                  </div>
                ))}
                <Notice>{q.policy}</Notice>
                {q.status === "accepted" && (
                  <Badge tone="green">
                    <Check size={14} /> Disetujui{" "}
                    {q.acceptedAt && date(q.acceptedAt)}
                  </Badge>
                )}
                {owner && q.status === "issued" && (
                  <Form
                    onSubmit={() =>
                      act(
                        "accept_quote",
                        { orderId: order.id, quoteId: q.id, consent: true },
                        "Penawaran disetujui. Lanjutkan pembayaran.",
                      )
                    }
                  >
                    <label className="checkbox">
                      <input type="checkbox" required />
                      Saya menyetujui versi desain, ukuran, bahan, total biaya,
                      waktu, dan kebijakan di atas. Pratinjau hanya ilustrasi.
                    </label>
                    <div className="form-actions">
                      <Button type="submit">
                        Setuju & lanjut bayar <ArrowRight size={16} />
                      </Button>
                      <Button
                        className="secondary"
                        onClick={() =>
                          run(() =>
                            act(
                              "decline_quote",
                              {
                                orderId: order.id,
                                quoteId: q.id,
                                consent: true,
                              },
                              "Operator akan menindaklanjuti alternatif/pengembalian",
                            ),
                          )
                        }
                      >
                        Tolak penawaran
                      </Button>
                    </div>
                  </Form>
                )}
                {owner &&
                  q.status === "accepted" &&
                  order.status === "awaiting_payment" && (
                    <div className="payment-box">
                      <Badge tone="yellow">
                        {data.integrations.midtrans
                          ? "MIDTRANS SANDBOX"
                          : "SIMULASI LOKAL — BUKAN MIDTRANS"}
                      </Badge>
                      <h3>Satu langkah sebelum pengerjaan.</h3>
                      <p>
                        {data.integrations.midtrans
                          ? "Checkout menggunakan lingkungan pengujian Midtrans. Tidak menggunakan uang nyata."
                          : "Kunci Midtrans belum tersedia. Tombol berikut hanya menguji alur status lokal, tidak menghubungi payment gateway."}
                      </p>
                      {!currentPayment && (
                        <Button
                          disabled={paymentBusy}
                          onClick={() =>
                            run(async () => {
                              setPaymentBusy(true);
                              try {
                                const p = await act(
                                  "create_payment",
                                  { orderId: order.id },
                                  "Transaksi pengujian dibuat",
                                );
                                if (p.redirectUrl)
                                  window.open(
                                    String(p.redirectUrl),
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                              } finally {
                                setPaymentBusy(false);
                              }
                            })
                          }
                        >
                          {paymentBusy ? (
                            <Loader2 size={16} className="spin" />
                          ) : (
                            <ReceiptText size={16} />
                          )}{" "}
                          {data.integrations.midtrans
                            ? "Buka checkout Sandbox"
                            : "Buat simulasi pembayaran"}
                        </Button>
                      )}
                      {currentPayment?.mode === "simulation" &&
                        currentPayment.status === "pending" && (
                          <Button
                            onClick={() =>
                              run(() =>
                                act(
                                  "simulate_payment",
                                  { paymentId: currentPayment.id },
                                  "Simulasi selesai. Belum ada uang berpindah.",
                                ),
                              )
                            }
                          >
                            Selesaikan simulasi lokal <Check size={16} />
                          </Button>
                        )}
                      {currentPayment?.redirectUrl &&
                        currentPayment.status === "pending" && (
                          <a
                            className="button"
                            target="_blank"
                            rel="noreferrer"
                            href={currentPayment.redirectUrl}
                          >
                            Lanjut checkout Sandbox <ArrowUpRight size={16} />
                          </a>
                        )}
                      {currentPayment && (
                        <p className="muted">
                          Status server: {statusLabel[currentPayment.status]}
                        </p>
                      )}
                    </div>
                  )}
              </>
            )}
            {payments.length > 0 && (
              <>
                <h3 className="top-gap">Riwayat pembayaran</h3>
                {payments.map((p) => (
                  <div className="simple-row" key={p.id}>
                    <span>
                      <strong>{money(p.amount)}</strong>
                      <small>
                        {p.mode === "simulation"
                          ? "Simulasi lokal"
                          : "Midtrans Sandbox"}
                      </small>
                    </span>
                    <Badge tone={p.status === "paid" ? "green" : "neutral"}>
                      {statusLabel[p.status]}
                    </Badge>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      {tab === "journey" && (
        <div className="journey-layout">
          <section className="panel">
            <div className="eyebrow">SETIAP LANGKAH TERCATAT</div>
            <h2>Perjalanan pakaianmu.</h2>
            <div className="timeline">
              {order.events.map((e, i) => (
                <div key={e.id} className="timeline-item">
                  <span
                    className={i === order.events.length - 1 ? "current" : ""}
                  >
                    <Check size={13} />
                  </span>
                  <div>
                    <h3>{e.label}</h3>
                    <p>
                      {e.actor} · {date(e.at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {order.tracking && (
              <Notice>
                Resi simulasi: <strong>{order.tracking}</strong>. Tidak
                terhubung ke kurir.
              </Notice>
            )}
            {owner && order.status === "shipped" && (
              <Button
                onClick={() =>
                  run(() =>
                    act(
                      "complete",
                      { orderId: order.id },
                      "Penerimaan dikonfirmasi",
                    ),
                  )
                }
              >
                <CheckCircle2 size={16} /> Konfirmasi sudah diterima
              </Button>
            )}
          </section>
          <aside className="panel">
            <ShieldCheck size={25} />
            <h3>Butuh bantuan?</h3>
            <p>
              Jika hasil berbeda dari spesifikasi atau ada kerusakan, ceritakan
              kepada operator. Penyelesaian ditinjau dari dokumentasi dan
              persetujuanmu.
            </p>
            {owner &&
              ["shipped", "delivered", "completed", "on_hold"].includes(
                order.status,
              ) && (
                <Form
                  onSubmit={(f) =>
                    act(
                      "create_claim",
                      { orderId: order.id, description: f.get("description") },
                      "Keluhan diterima operator",
                    )
                  }
                >
                  <Field label="Jelaskan keluhanmu">
                    <textarea
                      required
                      minLength={5}
                      name="description"
                      placeholder="Bagian mana yang berbeda atau rusak?"
                    />
                  </Field>
                  <Button type="submit" className="secondary">
                    Ajukan keluhan <ArrowRight size={15} />
                  </Button>
                </Form>
              )}
            {data.claims
              .filter((c) => c.orderId === order.id)
              .map((c) => (
                <div className="claim-mini" key={c.id}>
                  <Badge>{statusLabel[c.status]}</Badge>
                  <p>{c.description}</p>
                  {c.response && <Notice>{c.response}</Notice>}
                </div>
              ))}
          </aside>
        </div>
      )}
      {tab === "manage" && (admin || tailor) && (
        <div className="manage-grid">
          <section className="panel">
            <div className="eyebrow">KONTROL PENGERJAAN</div>
            <h2>Jaga setiap detail.</h2>
            <Notice>
              Seluruh serah-terima, pengerjaan, dan pengiriman di prototipe ini
              bersifat simulasi. Jangan gunakan untuk menerima pakaian nyata
              sebelum kebijakan pilot disetujui.
            </Notice>
            {admin && (
              <Form
                onSubmit={(f) =>
                  act("assign_tailor", {
                    orderId: order.id,
                    tailorId: f.get("tailorId"),
                  })
                }
              >
                <Field label="Penjahit ditugaskan">
                  <select name="tailorId" defaultValue={shop?.tailorId||''} key={shop?.tailorId||'none'} required>
                    <option value="" disabled>Tetapkan penjahit toko terlebih dahulu</option>
                    {data.users
                      .filter((u) => u.role === "tailor" && u.id === shop?.tailorId)
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <p>Penjahit pesanan saat ini: {data.users.find(u=>u.id===order.tailorId)?.name||'Belum ditetapkan'}. Perubahan penjahit toko tidak memindahkan pesanan ini secara otomatis.</p>
                <Button type="submit" className="small secondary" disabled={!shop?.tailorId}>
                  Simpan penugasan
                </Button>
              </Form>
            )}
            {admin && order.status === "awaiting_intake" && (
              <Form
                onSubmit={(f) => {
                  if (!intakePhoto) throw new Error("Unggah foto kondisi awal");
                  return act(
                    "intake",
                    {
                      orderId: order.id,
                      notes: f.get("notes"),
                      assetId: intakePhoto,
                    },
                    "Pemeriksaan awal dicatat",
                  );
                }}
              >
                <h3 className="top-gap">Penerimaan & pemeriksaan fisik</h3>
                <FilePicker
                  orderId={order.id}
                  purpose="intake"
                  upload={upload}
                  onUploaded={setIntakePhoto}
                />
                <Field label="Kondisi awal, bahan, dan kelayakan">
                  <textarea
                    name="notes"
                    required
                    placeholder="Catat label/SKU, noda, jahitan, kampuh, bahan, dan batas perubahan…"
                  />
                </Field>
                <Button type="submit">Catat pemeriksaan</Button>
              </Form>
            )}
            {order.intake && (
              <div className="intake-record">
                <h3>Kondisi saat diterima</h3>
                <p>{order.intake.notes}</p>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/files/${order.intake.assetId}`}
                  className="text-link"
                >
                  Lihat dokumentasi <ImageIcon size={15} />
                </a>
              </div>
            )}
            {["inspected", "awaiting_quote_approval", "on_hold"].includes(
              order.status,
            ) &&
              order.intake && (
                <Form
                  key={`quote-${draft?.id || q?.id || "new"}`}
                  onSubmit={(f) => {
                    const prices: Record<string, number> = {};
                    order.changes.forEach(
                      (c) => (prices[c.id] = Number(f.get(c.id))),
                    );
                    return act(
                      admin ? "issue_quote" : "propose_quote",
                      {
                        orderId: order.id,
                        prices,
                        materials: Number(f.get("materials")),
                        shipping: Number(f.get("shipping")),
                        days: Number(f.get("days")),
                        notes: f.get("notes"),
                      },
                      admin
                        ? "Penawaran diterbitkan ke pelanggan"
                        : "Usulan penawaran dikirim ke operator",
                    );
                  }}
                >
                  <h3 className="top-gap">
                    {admin
                      ? "Terbitkan penawaran akhir"
                      : "Usulkan penawaran ke operator"}
                  </h3>
                  {draft && (
                    <Notice>
                      Penjahit telah mengusulkan penawaran v{draft.version}.
                      Operator perlu memeriksa sebelum menerbitkan.
                    </Notice>
                  )}
                  {order.changes.map((c, i) => {
                    const s = data.services.find((s) => s.id === c.serviceId)!;
                    return (
                      <Field
                        key={c.id}
                        label={`${s.name} · ${c.quantity} ${s.unit} (harga per unit)`}
                      >
                        <input
                          type="number"
                          min={1}
                          max={10000000}
                          required
                          name={c.id}
                          defaultValue={
                            (draft || q)?.items[i]?.unitPrice ??
                            data.prices[order.shopId]?.[s.id] ??
                            s.price ??
                            ""
                          }
                        />
                      </Field>
                    );
                  })}
                  <div className="form-row">
                    <Field label="Bahan yang belum termasuk (Rp)">
                      <input
                        type="number"
                        name="materials"
                        min={0}
                        required
                        defaultValue={draft?.materials || 0}
                      />
                    </Field>
                    <Field label="Pengiriman dibebankan (Rp)">
                      <input
                        type="number"
                        name="shipping"
                        min={0}
                        required
                        defaultValue={draft?.shipping || 0}
                      />
                    </Field>
                  </div>
                  <Field label="Durasi kerja setelah bahan siap (hari kerja)">
                    <input
                      name="days"
                      type="number"
                      min={1}
                      max={60}
                      required
                      defaultValue={draft?.days || 3}
                    />
                  </Field>
                  <Field label="Spesifikasi, bahan, toleransi, dan catatan teknis">
                    <textarea
                      name="notes"
                      required
                      defaultValue={
                        draft?.notes ||
                        "Pemeriksaan dan kelayakan demo. Konfirmasikan ukuran, bahan, posisi, toleransi, antrean dan tanggal mulai sebelum pekerjaan nyata."
                      }
                    />
                  </Field>
                  <Button type="submit">
                    {admin ? "Terbitkan penawaran" : "Ajukan ke operator"}
                    <ArrowRight size={16} />
                  </Button>
                </Form>
              )}
            {admin && order.status === "ready_for_work" && (
              <div className="top-gap">
                <Notice>
                  Pastikan intake, spesifikasi, persetujuan, bahan, dan
                  pembayaran sudah lengkap. Pelepasan ini memulai alur kerja
                  simulasi.
                </Notice>
                <Button
                  onClick={() =>
                    run(() =>
                      act(
                        "release_work",
                        { orderId: order.id },
                        "Pekerjaan simulasi dilepas",
                      ),
                    )
                  }
                >
                  Lepaskan pekerjaan <Scissors size={16} />
                </Button>
              </div>
            )}
            {order.status === "in_progress" && (
              <Form
                onSubmit={(f) => {
                  if (!qcPhoto) throw new Error("Unggah foto hasil pengerjaan");
                  return act(
                    "submit_qc",
                    {
                      orderId: order.id,
                      notes: f.get("notes"),
                      assetId: qcPhoto,
                    },
                    "Hasil diajukan untuk QC",
                  );
                }}
              >
                <h3 className="top-gap">Hasil pengerjaan</h3>
                <FilePicker
                  orderId={order.id}
                  purpose="qc"
                  upload={upload}
                  onUploaded={setQcPhoto}
                />
                <Field label="Catatan hasil dan ukuran akhir">
                  <textarea name="notes" required />
                </Field>
                <Button type="submit">Ajukan pemeriksaan kualitas</Button>
              </Form>
            )}
            {admin && order.status === "qc" && (
              <Form
                onSubmit={(f) =>
                  act("qc_decision", {
                    orderId: order.id,
                    passed: f.get("passed") === "yes",
                    notes: f.get("notes"),
                  })
                }
              >
                <h3 className="top-gap">Keputusan QC</h3>
                {order.qc && (
                  <>
                    <p>{order.qc.notes}</p>
                    <a
                      className="text-link"
                      href={`/api/files/${order.qc.assetId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lihat hasil <ImageIcon size={15} />
                    </a>
                  </>
                )}
                <Field label="Hasil pemeriksaan">
                  <select name="passed">
                    <option value="yes">
                      Sesuai spesifikasi, siap dikirim
                    </option>
                    <option value="no">Perlu pengerjaan ulang</option>
                  </select>
                </Field>
                <Field label="Catatan pemeriksaan">
                  <textarea name="notes" required />
                </Field>
                <Button type="submit">Simpan hasil QC</Button>
              </Form>
            )}
            {admin && order.status === "ready_to_ship" && (
              <Form
                onSubmit={(f) =>
                  act("ship", {
                    orderId: order.id,
                    tracking: f.get("tracking"),
                  })
                }
              >
                <h3 className="top-gap">Pengiriman simulasi</h3>
                <Field label="Nomor resi">
                  <input
                    name="tracking"
                    required
                    minLength={5}
                    placeholder="DEMO-RUPA-001"
                  />
                </Field>
                <Button type="submit">Catat pengiriman</Button>
              </Form>
            )}
          </section>
          <aside className="panel">
            <h3>Prinsip pengerjaan</h3>
            <ul className="check-list">
              <li>
                <Check size={15} /> Identitas pakaian dicocokkan
              </li>
              <li>
                <Check size={15} /> Kondisi awal difoto
              </li>
              <li>
                <Check size={15} /> Ukuran dan metode jelas
              </li>
              <li>
                <Check size={15} /> Perubahan dinilai bersamaan
              </li>
              <li>
                <Check size={15} /> Harga dan waktu disetujui
              </li>
              <li>
                <Check size={15} /> Pembayaran diverifikasi server
              </li>
              <li>
                <Check size={15} /> QC terhadap spesifikasi
              </li>
            </ul>
            <Notice>
              Persetujuan pelanggan tidak boleh dibuat oleh toko atau penjahit
              atas nama pelanggan.
            </Notice>
          </aside>
        </div>
      )}
    </div>
  );
}

function Privacy({ data, act }: { data: Bootstrap; act: Actions["act"] }) {
  const u = data.user!;
  const p = data.privacy[u.id] || { training: false, marketing: false };
  return (
    <div className="page-shell privacy-page">
      <div className="eyebrow">AKUN & PILIHAN DATA</div>
      <h1>Tetap di tanganmu.</h1>
      <p>
        Kamu tidak perlu membagikan seluruh profil tubuh untuk membuat pakaian
        lebih personal.
      </p>
      <div className="detail-grid">
        <section className="panel">
          <h3>{u.name}</h3>
          <p>{u.email}</p>
          <Badge>{roleLabel[u.role]}</Badge>
          <Form
            onSubmit={(f) =>
              act(
                "privacy",
                {
                  training: f.get("training") === "on",
                  marketing: f.get("marketing") === "on",
                },
                "Pilihan privasi disimpan",
              )
            }
          >
            <h3 className="top-gap">Pilihan yang terpisah</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                name="training"
                defaultChecked={p.training}
              />
              Izinkan penggunaan untuk pelatihan di masa mendatang. Saat ini
              belum ada proses pelatihan dari data pelanggan.
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="marketing"
                defaultChecked={p.marketing}
              />
              Saya bersedia menerima informasi pemasaran. Pilihan ini tidak
              memengaruhi akses layanan.
            </label>
            <Button type="submit">
              Simpan pilihan <Check size={15} />
            </Button>
          </Form>
          <Form
            onSubmit={() =>
              act(
                "privacy",
                {
                  training: p.training,
                  marketing: p.marketing,
                  deletionRequested: true,
                },
                "Permintaan penghapusan dicatat untuk operator",
              )
            }
          >
            <h3 className="top-gap">Penghapusan data</h3>
            <p>
              Permintaan ini perlu diproses operator. Bukti transaksi atau
              garansi yang masih diperlukan diperiksa terlebih dahulu; data
              tidak diklaim terhapus seketika.
            </p>
            <Button type="submit" className="secondary">
              Ajukan penghapusan data
            </Button>
            {p.deletionRequested && (
              <small>Permintaan tercatat: {date(p.deletionRequested)}</small>
            )}
          </Form>
        </section>
        <aside className="panel">
          <LockKeyhole size={25} />
          <h3>Data sesuai kebutuhan.</h3>
          <p>
            Foto bukti hanya untuk verifikasi. Ukuran dan foto pakaian hanya
            dibagikan kepada pihak layanan yang berwenang. Toko tidak otomatis
            dapat melihat ukuran atau foto tubuhmu.
          </p>
          <Notice>
            {data.mode === "demo"
              ? "Data demo tersimpan lokal pada komputer ini. Hindari mengunggah dokumen atau data pribadi nyata untuk pengujian."
              : "Data tersimpan pada proyek Supabase yang dikonfigurasi. Kebijakan penyimpanan dan penghapusan produksi masih perlu ditetapkan."}
          </Notice>
        </aside>
      </div>
    </div>
  );
}
function How() {
  return (
    <div className="page-shell how-page">
      <div className="eyebrow">CARA KERJA RUPA</div>
      <h1>
        Lebih personal.
        <br />
        <em>Tetap punya kepastian.</em>
      </h1>
      <p className="intro">
        Kamu membawa ide. Kami membantu menerjemahkannya menjadi proses yang
        jelas bersama toko dan penjahit.
      </p>
      <div className="how-grid">
        {[
          [
            "01",
            "Pilih dan beli dari toko mitra",
            "Beli pakaian di kanal toko. Ajukan nomor transaksi dan bukti minimum untuk diperiksa pemilik toko.",
          ],
          [
            "02",
            "Ceritakan perubahan yang diinginkan",
            "Tambahkan beberapa perubahan dalam satu pesanan. Pilih pendampingan desain, ukuran, pratinjau, atau langsung chat penjahit.",
          ],
          [
            "03",
            "Periksa pakaian, pastikan kelayakan",
            "Setelah kamu memberi izin, pakaian diterima dan didokumentasikan. Penjahit memeriksa bahan, kampuh, serta batas perubahan.",
          ],
          [
            "04",
            "Setujui desain, harga, dan waktu",
            "Kamu menerima rincian akhir. Tidak ada pemotongan sebelum persetujuan dan pembayaran terverifikasi.",
          ],
          [
            "05",
            "Dikerjakan dan diperiksa kembali",
            "Penjahit bekerja sesuai spesifikasi. Operator memeriksa hasil sebelum pakaian dikirim.",
          ],
          [
            "06",
            "Terima hasil dan dapatkan pendampingan",
            "Jika ada ketidaksesuaian atau kerusakan dalam tanggung jawab layanan, laporkan melalui pesanan. Operator menangani penyelesaiannya.",
          ],
        ].map(([n, t, d]) => (
          <article key={n}>
            <span>{n}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </div>
      <div className="how-bottom">
        <ShieldCheck size={29} />
        <div>
          <h3>Transparan sejak awal.</h3>
          <p>
            AI memberi saran, bukan jaminan fit atau kelayakan teknis. Preview
            adalah ilustrasi. Pembelian pakaian berbeda dari pembayaran jasa.
            Harga dan waktu awal masih estimasi.
          </p>
          <p>
            Prototipe ini menggunakan toko fiktif dan transaksi pengujian.
            Garansi komersial, biaya pengiriman/pemeriksaan, dan kebijakan
            pengembalian harus ditetapkan sebelum menerima pakaian nyata.
          </p>
        </div>
      </div>
      <Link className="button" href="/shops">
        Temukan toko pilihanmu <ArrowUpRight size={17} />
      </Link>
    </div>
  );
}
