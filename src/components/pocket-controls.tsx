"use client";
import type {DesignMarkup,PocketSpec} from "@/lib/design-markup";
import {patchPocket,pocketColors} from "@/lib/pocket-design";
export function PocketControls({value,id,index,onChange}:{value:DesignMarkup;id:string;index:number;onChange:(v:DesignMarkup)=>void}){
  const p=value.details?.find(d=>d.id===id)?.pocket;
  if(!p)return null;
  const update=(change:Partial<PocketSpec>)=>onChange(patchPocket(value,id,change));
  return <div className="pocket-controls">
    <label className="field"><span>Bentuk saku {index}</span><select value={p.shape} onChange={e=>update({shape:e.target.value as PocketSpec["shape"]})}><option value="rectangular">Persegi panjang</option><option value="rounded_bottom">Sudut bawah membulat</option></select></label>
    <label className="field"><span>Warna saku {index}</span><select value={p.color} onChange={e=>update({color:e.target.value as PocketSpec["color"]})}>{Object.entries(pocketColors).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {(["width","height"] as const).map(axis=><label className="field" key={axis}><span>{axis==="width"?"Lebar":"Tinggi"} visual saku {index}: {Math.round(p.box[axis]*100)}% foto</span><input type="range" min="6" max="50" step="1" value={p.box[axis]*100} onChange={e=>{const box={...p.box,[axis]:Number(e.target.value)/100};box.x=Math.min(box.x,1-box.width);box.y=Math.min(box.y,1-box.height);update({box});}}/></label>)}
    <p>Geser nomor pada foto untuk memindahkan saku. Garis putus-putus menunjukkan bentuk dan ukuran visual, bukan ukuran jahit dalam cm. Tiga alternatif: saku terbuka, dengan penutup, dan lipit tengah. Warna, posisi dan ukuran luar tetap mengikuti pilihanmu. AI dibantu sketsa bentuk; tekstur dan hasil jahit tetap perlu diperiksa penjahit.</p>
    <label className="field"><span>Catatan untuk penjahit {index} (tidak digambar otomatis)</span><input value={p.extra} maxLength={140} onChange={e=>update({extra:e.target.value})} placeholder="Contoh: gunakan benang senada"/></label>
    <label className="pocket-confirm"><input type="checkbox" checked={p.confirmed} onChange={e=>update({confirmed:e.target.checked})}/> Saya sudah memeriksa warna, bentuk, posisi dan ukuran visual saku ini.</label>
  </div>;
}
