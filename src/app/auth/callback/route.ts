import { NextRequest, NextResponse } from "next/server";
import { supabaseSession } from "@/lib/auth";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next");
  if (code) {
    const c = await supabaseSession();
    const { error } = await c.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(next === "/reset-password" ? next : "/orders", req.url),
      );
  }
  return NextResponse.redirect(new URL("/login?error=verification", req.url));
}
