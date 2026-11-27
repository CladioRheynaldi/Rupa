"use client";
import { useRef } from "react";

export type EditRegion = { x: number; y: number; width: number; height: number };
export function EditRegionPicker({ photo, value, onChange }: {
  photo: string; value?: EditRegion; onChange: (region: EditRegion | undefined) => void;
}) {
  const start = useRef<{x:number;y:number} | null>(null);
  return <fieldset className="edit-region-picker">
    <legend>Tandai area perubahan</legend>
    <p>Tarik kotak pada detail pakaian yang ingin diubah. Area di luar kotak dipertahankan dari foto awal. Kanan/kiri mengikuti sisi pemakai; pastikan posisi kotak sesuai.</p>
    <div className="region-surface" aria-label="Foto untuk menandai area perubahan"
      onPointerDown={e => {
        if (e.button !== 0) return;
        const b = e.currentTarget.getBoundingClientRect();
        start.current = {x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height};
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        if (!start.current) return;
        const b = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0,Math.min(1,(e.clientX-b.left)/b.width));
        const y = Math.max(0,Math.min(1,(e.clientY-b.top)/b.height));
        const region = {x:Math.min(x,start.current.x),y:Math.min(y,start.current.y),width:Math.abs(x-start.current.x),height:Math.abs(y-start.current.y)};
        if (region.width >= .02 && region.height >= .02) onChange(region);
      }}
      onPointerUp={() => { start.current = null; }}
      onPointerCancel={() => { start.current = null; }}>
      <img src={`/api/files/${photo}`} alt="Pakaian awal: tarik kotak pada area yang ingin diubah" draggable={false}/>
      {value && <span className="region-selection" style={{left:`${value.x*100}%`,top:`${value.y*100}%`,width:`${value.width*100}%`,height:`${value.height*100}%`}}/>}
    </div>
    <div className="form-actions">
      <button type="button" className="button secondary small" onClick={() => onChange({x:.25,y:.25,width:.5,height:.5})}>Pilih area tengah</button>
      <button type="button" className="button secondary small" onClick={() => onChange(undefined)}>Hapus area</button>
    </div>
    {value && <div className="region-coordinates">
      {(["x","y","width","height"] as const).map((key,i) => <label key={key}>
        {["Posisi X","Posisi Y","Lebar","Tinggi"][i]} (%)
        <input type="number" aria-label={`Area ${key} (%)`} min={key === "x" || key === "y" ? 0 : 2} max={100} step={1}
          value={Math.round(value[key]*100)} onChange={e => {
            const next = {...value,[key]:Math.max(key === "x" || key === "y" ? 0 : .02,Math.min(1,Number(e.target.value)/100))};
            next.x = Math.min(next.x,.98); next.y = Math.min(next.y,.98);
            next.width = Math.min(next.width,1-next.x); next.height = Math.min(next.height,1-next.y);
            onChange(next);
          }}/>
      </label>)}
    </div>}
    <small>{value ? "Area sudah dipilih. Sertakan sedikit kain di sekitar detail agar sambungan lebih alami." : "Pilih area sebelum membuat desain. Bisa memakai tombol area tengah lalu mengatur persentasenya."}</small>
  </fieldset>;
}
