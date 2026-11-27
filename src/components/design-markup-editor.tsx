"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { DesignMarkup } from "@/lib/design-markup";
import {pocketHex} from "@/lib/pocket-design";
const empty = {strokes:[]} as DesignMarkup;

export function DesignMarkupEditor({photo,value=empty,onChange,readOnly=false,activeDetailId,onPlaceDetail,onMarkerDragStart,surfaceRef}: {
  activeDetailId?:string; onPlaceDetail?:(id:string,x:number,y:number)=>void; onMarkerDragStart?:(id:string)=>void; surfaceRef?:RefObject<HTMLDivElement|null>;
  photo:string; value?:DesignMarkup; onChange?:(value:DesignMarkup)=>void; readOnly?:boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const current = useRef(value);
  const [size,setSize] = useState({width:1024,height:1024});
  const [brush,setBrush] = useState(30);
  const [tool,setTool] = useState<"draw"|"erase">("draw");
  const [redo,setRedo] = useState<DesignMarkup["strokes"]>([]);
  const [limit,setLimit] = useState("");
  current.current = value;
  useEffect(() => { setRedo([]); drawing.current=false; },[photo]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0,0,size.width,size.height);
    for (const stroke of value.strokes) {
      context.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
      const index=value.details?.findIndex(d=>d.id===stroke.detailId) ?? 0;
      const color=["#56a82b","#4385d6","#dd9227","#a659c8"][Math.max(0,index)%4];
      context.strokeStyle = color; context.fillStyle = color;
      context.lineWidth = stroke.width*size.width;
      context.lineCap = "round"; context.lineJoin = "round";
      const [first,...points] = stroke.points;
      context.beginPath(); context.arc(first[0]*size.width,first[1]*size.height,context.lineWidth/2,0,Math.PI*2); context.fill();
      context.beginPath(); context.moveTo(first[0]*size.width,first[1]*size.height);
      for (const [x,y] of points) context.lineTo(x*size.width,y*size.height);
      if(stroke.tool === "draw" && stroke.points.length>=4){
        const coords=stroke.points.map(([x,y])=>[Math.round(x*(size.width-1)),Math.round(y*(size.height-1))]);
        const last=coords.at(-1)!,start=coords[0],width=Math.round(stroke.width*size.width);
        const area=Math.abs(coords.reduce((sum,[x,y],i)=>{const next=coords[(i+1)%coords.length];return sum+x*next[1]-next[0]*y;},0))/2;
        if(Math.hypot(start[0]-last[0],start[1]-last[1])<=2*width && area>width*width){context.closePath();context.fill();}
      }
      context.stroke();
    }
  },[value,size]);
  const commit = (next:DesignMarkup) => { current.current=next; onChange?.(next); };
  return <fieldset className="design-markup-editor">
    <legend>{readOnly ? "Area yang ditandai pelanggan" : "Coret area yang ingin diubah"}</legend>
    <p>Pilih nomor detail lalu tandai area perubahan. Lingkaran atau bentuk tertutup akan mengisi seluruh bagian dalam sebagai area edit. Tarik nomor deskripsi ke area tersebut. Warna dan nomor hanya penanda, bukan desain akhir. Kiri/kanan mengikuti sisi pemakai.</p>
    {!readOnly && !value.details?.find(d=>d.id===activeDetailId)?.pocket && <div className="markup-toolbar">
      <button type="button" className={`button small ${tool === "draw" ? "" : "secondary"}`} aria-pressed={tool === "draw"} onClick={() => setTool("draw")}>Kuas</button>
      <button type="button" className={`button small ${tool === "erase" ? "" : "secondary"}`} aria-pressed={tool === "erase"} onClick={() => setTool("erase")}>Penghapus</button>
      <label>Ukuran kuas <input aria-label="Ukuran kuas" type="range" min="8" max="100" value={brush} onChange={e=>setBrush(Number(e.target.value))}/></label>
      <button type="button" className="button secondary small" disabled={!value.strokes.length} onClick={() => {
        setRedo([...redo,value.strokes.at(-1)!]); commit({...current.current,strokes:value.strokes.slice(0,-1)});
      }}>Urungkan</button>
      <button type="button" className="button secondary small" disabled={!redo.length} onClick={() => {
        commit({...current.current,strokes:[...value.strokes,redo.at(-1)!]}); setRedo(redo.slice(0,-1));
      }}>Ulangi</button>
      <button type="button" className="button secondary small" disabled={!value.strokes.length} onClick={() => {commit({...current.current,strokes:[]});setRedo([]);}}>Hapus semua</button>
      <button type="button" className="button secondary small" onClick={() => {
        commit({...current.current,strokes:[{tool:"draw",detailId:activeDetailId,width:.15,points:[[.35,.45],[.65,.45],[.65,.55],[.35,.55]]}]});setRedo([]);
      }}>Tandai tengah</button>
    </div>}
    <div className="markup-surface" ref={surfaceRef} onDragOver={e=>{if(!readOnly)e.preventDefault();}}
      onDrop={e=>{e.preventDefault();if(readOnly)return;const id=e.dataTransfer.getData("text/rupa-detail");const b=e.currentTarget.getBoundingClientRect();if(id)onPlaceDetail?.(id,Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height)));}}>
      <img src={`/api/files/${photo}`} alt="Foto dasar pakaian" draggable={false} onLoad={e => {
        const image=e.currentTarget; setSize({width:1024,height:Math.round(1024*image.naturalHeight/image.naturalWidth)});
      }}/>
      <canvas ref={canvas} width={size.width} height={size.height} aria-label={readOnly ? "Coretan area perubahan tersimpan" : "Kanvas coretan area perubahan"}
        style={{pointerEvents:readOnly||value.details?.find(d=>d.id===activeDetailId)?.pocket?"none":"auto"}}
        onPointerDown={e => {
          if(readOnly || e.button !== 0) return;
          if(value.strokes.length >= 60 || value.strokes.reduce((n,s)=>n+s.points.length,0)>=2000) {setLimit("Maksimal 60 coretan. Hapus atau urungkan coretan lama.");return;}
          const b=e.currentTarget.getBoundingClientRect();
          const point:[number,number]=[Math.round(Math.max(0,Math.min(1,(e.clientX-b.left)/b.width))*10000)/10000,Math.round(Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))*10000)/10000];
          drawing.current=true; setRedo([]);setLimit("");e.currentTarget.setPointerCapture(e.pointerId);
          commit({...current.current,strokes:[...current.current.strokes,{tool,detailId:tool === "draw" ? activeDetailId : undefined,width:brush/1024,points:[point]}]});
        }}
        onPointerMove={e => {
          if(!drawing.current || readOnly) return;
          const b=e.currentTarget.getBoundingClientRect();
          const point:[number,number]=[Math.round(Math.max(0,Math.min(1,(e.clientX-b.left)/b.width))*10000)/10000,Math.round(Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))*10000)/10000];
          const strokes=current.current.strokes;
          const last=strokes.at(-1)!; const previous=last.points.at(-1)!;
          if(Math.hypot(point[0]-previous[0],point[1]-previous[1]) < .003) return;
          if(last.points.length>=200 || strokes.reduce((n,s)=>n+s.points.length,0)>=2000) {
            drawing.current=false;setLimit("Batas panjang coretan tercapai. Buat coretan lebih sederhana.");return;
          }
          commit({...current.current,strokes:[...strokes.slice(0,-1),{...last,points:[...last.points,point]}]});
        }} onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}}/>
      <svg className="pocket-outline-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Garis panduan bentuk saku">{value.details?.map(d=>d.pocket&&<g key={d.id} stroke={pocketHex[d.pocket.color]} strokeWidth="4" fill="none" strokeDasharray="10 6"><rect x={d.pocket.box.x*1000} y={d.pocket.box.y*1000} width={d.pocket.box.width*1000} height={d.pocket.box.height*1000} rx={d.pocket.shape==="rounded_bottom"?20:0}/><path d={`M ${d.pocket.box.x*1000} ${(d.pocket.box.y+d.pocket.box.height*.1)*1000} h ${d.pocket.box.width*1000}`}/></g>)}</svg>
      {value.details?.map((detail,index)=>detail.x !== undefined && detail.y !== undefined && <button
        key={detail.id} type="button" className="detail-pin" aria-label={`Detail ${index+1} pada canvas`}
        style={{left:`${detail.x*100}%`,top:`${detail.y*100}%`,background:["#56a82b","#4385d6","#dd9227","#a659c8"][index%4]}}
        disabled={readOnly} onPointerDown={e=>{if(readOnly)return;e.preventDefault();e.stopPropagation();onMarkerDragStart?.(detail.id);}}
        onKeyDown={e=>{const delta:{[key:string]:[number,number]}={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};const move=delta[e.key];if(move&&!readOnly){e.preventDefault();onPlaceDetail?.(detail.id,Math.max(0,Math.min(1,detail.x!+move[0])),Math.max(0,Math.min(1,detail.y!+move[1])));}}}
      >{index+1}</button>)}
    </div>
    {limit && <p role="alert">{limit}</p>}
    {!readOnly && <small>Gunakan mouse, jari, atau stylus. Simpan penanda agar bisa dibuka kembali dan dilihat penjahit.</small>}
  </fieldset>;
}
