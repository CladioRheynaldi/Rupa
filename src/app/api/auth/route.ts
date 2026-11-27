import { NextRequest } from "next/server";
import { z } from "zod";
import {
  signIn,
  signOut,
  register,
  rateLimit,
  supabaseSession,
} from "@/lib/auth";
import { appMode } from "@/lib/store";
import { AppError } from "@/lib/domain";
import { json, failure, safeOrigin } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    safeOrigin(req);
    await rateLimit(
      `auth:${req.headers.get("x-forwarded-for") || "local"}`,
      15,
      60000,
    );
    if (Number(req.headers.get("content-length") || 0) > 10000)
      throw new AppError("Permintaan terlalu besar", 413);
    const body = await req.json();
    const action = body.action;
    if (action === "logout") {
      await signOut();
      return json({ ok: true });
    }
    if (action === "reset_password") {
      const s = z.string().min(12).max(128).safeParse(body.password);
      if (!s.success) throw new AppError("Kata sandi minimal 12 karakter");
      if (appMode() !== "supabase")
        throw new AppError(
          "Pemulihan email tidak tersedia pada demo lokal. Gunakan akun demo yang disediakan.",
        );
      const c = await supabaseSession();
      const {
        data: { user },
      } = await c.auth.getUser();
      if (!user)
        throw new AppError(
          "Tautan pemulihan tidak valid atau kedaluwarsa",
          401,
        );
      const { error } = await c.auth.updateUser({ password: s.data });
      if (error) throw new AppError("Kata sandi belum dapat diubah");
      return json({ message: "Kata sandi diperbarui. Silakan masuk kembali." });
    }
    const email = z
      .email()
      .max(200)
      .safeParse(body.email?.toLowerCase().trim());
    if (!email.success) throw new AppError("Masukkan alamat email yang valid");
    if (action === "forgot") {
      if (appMode() === "supabase") {
        const c = await supabaseSession();
        await c.auth.resetPasswordForEmail(email.data, {
          redirectTo: `${process.env.APP_URL}/auth/callback?next=/reset-password`,
        });
      }
      return json({
        message:
          appMode() === "demo"
            ? "Demo lokal tidak mengirim email. Masuk menggunakan akun demo; reset email aktif setelah Supabase dikonfigurasi."
            : "Jika akun sesuai, tautan pemulihan akan dikirim ke email tersebut.",
      });
    }
    const password = z
      .string()
      .min(action === "register" ? 12 : 1)
      .max(128)
      .safeParse(body.password);
    if (!password.success)
      throw new AppError("Kata sandi pendaftaran minimal 12 karakter");
    if (action === "login") {
      await signIn(email.data, password.data);
      return json({ ok: true });
    }
    if (action === "register") {
      const name = z.string().trim().min(2).max(80).safeParse(body.name);
      if (!name.success) throw new AppError("Nama minimal dua karakter");
      return json(await register(name.data, email.data, password.data));
    }
    throw new AppError("Tindakan tidak dikenal");
  } catch (e) {
    return failure(e);
  }
}
