import { getUser } from "@/lib/auth";
import { readState, appMode, supabaseAdmin } from "@/lib/store";
import { view } from "@/lib/domain";
import { json, failure } from "@/lib/http";
import { demoMenuEnabled } from "@/lib/demo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getUser();
    const { state, revision } = await readState();
    let aiHealth;
    if (process.env.AI_WORKER_URL && process.env.AI_WORKER_TOKEN) {
      try {
        const response = await fetch(
          new URL("/health", process.env.AI_WORKER_URL),
          { cache: "no-store", signal: AbortSignal.timeout(1000) },
        );
        if (response.ok) {
          const health = await response.json();
          aiHealth = {
            ok: health.ok === true,
            analysis_ready: health.analysis_ready === true,
            retrieval_ready: health.retrieval_ready === true,
            preview_ready: health.preview_ready === true,
            inpainting_ready: health.inpainting_ready === true,
            sdxl_ready: health.sdxl_ready === true,
            controlnet_ready: health.controlnet_ready === true,
            device: health.device === "cuda" ? "cuda" : "cpu",
            gpu_name: typeof health.gpu_name === "string" ? health.gpu_name : undefined,
          };
        }
      } catch {
        /* Manual forms remain usable while the local worker starts. */
      }
    }
    if (appMode() === "supabase" && user?.role === "admin") {
      const { data } = await supabaseAdmin()
        .from("rupa_profiles")
        .select("id,name,role,shop_id");
      if (data)
        state.users = data.map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          shopId: u.shop_id || undefined,
          email: "",
        }));
    }
    return json({
      ...view(state, user),
      user,
      revision,
      mode: appMode(),
      demoMenu: demoMenuEnabled(),
      integrations: {
        ai: !!(process.env.AI_WORKER_URL && process.env.AI_WORKER_TOKEN),
        aiHealth,
        midtrans: !!process.env.MIDTRANS_SERVER_KEY,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
