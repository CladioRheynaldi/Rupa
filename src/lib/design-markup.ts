import { z } from "zod";
export const pocketSchema=z.object({
  shape:z.enum(["rectangular","rounded_bottom"]),
  color:z.enum(["navy","black","cream"]),
  box:z.object({x:z.number().min(0).max(.94),y:z.number().min(0).max(.94),width:z.number().min(.06).max(.5),height:z.number().min(.06).max(.5)}).refine(b=>b.x+b.width<=1.000001&&b.y+b.height<=1.000001,"Garis saku harus berada di dalam foto"),
  confirmed:z.boolean(),
  extra:z.string().max(140).default(""),
});
export type PocketSpec=z.infer<typeof pocketSchema>;
export const designMarkupSchema = z.object({
  strokes: z.array(z.object({
    tool: z.enum(["draw", "erase"]),
    detailId: z.string().min(1).max(80).optional(),
    width: z.number().min(.003).max(.15),
    points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(1).max(200),
  })).max(60),
  details: z.array(z.object({
    id: z.string().min(1).max(80),
    text: z.string().max(400),
    pocket:pocketSchema.optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
  })).max(8).optional(),
}).superRefine((m,ctx)=>{
  const ids = m.details?.map(d=>d.id) || [];
  if (new Set(ids).size !== ids.length) ctx.addIssue({code:"custom",message:"Nomor detail harus unik"});
  if (m.details?.some(d=>(d.x === undefined)!==(d.y === undefined))) ctx.addIssue({code:"custom",message:"Posisi detail belum lengkap"});
  if (m.strokes.some(s=>s.detailId && !ids.includes(s.detailId))) ctx.addIssue({code:"custom",message:"Coretan mengacu pada detail yang tidak ada"});
}).refine(m => m.strokes.reduce((n,s) => n+s.points.length,0) <= 2000, "Coretan terlalu panjang; sederhanakan penanda");
export type DesignMarkup = z.infer<typeof designMarkupSchema>;
