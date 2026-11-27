"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import type {DesignMarkup} from "@/lib/design-markup";
import {DesignMarkupEditor} from "./design-markup-editor";
import {newPocket,normalizePocketDetails,patchPocket} from "@/lib/pocket-design";
import {PocketControls} from "./pocket-controls";
export function NumberedDesignWorkspace({photo,value,onChange,uploadSlot,onSubmit,onSave,onConcept,children,ready}: {
  photo:string;value:DesignMarkup;onChange:(value:DesignMarkup)=>void;uploadSlot:ReactNode;
  onSubmit:(value:DesignMarkup)=>Promise<void>;onSave:(value:DesignMarkup)=>Promise<void>;onConcept:(prompt:string)=>Promise<void>;children:ReactNode;ready:boolean;
}) {
  const surface=useRef<HTMLDivElement>(null),current=useRef(value),dragging=useRef<string|null>(null);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [conceptPrompt,setConceptPrompt]=useState("");
  const [ghost,setGhost]=useState<{id:string;x:number;y:number}|null>(null);
  current.current=value;
  useEffect(()=>{
    if(photo && !value.details?.length){
      const id=crypto.randomUUID();
      onChange({...value,details:[{id,text:""}],strokes:value.strokes.map(s=>({...s,detailId:s.tool==="draw"?id:undefined}))});
    }
  },[photo]); // Initialize one editable description for a newly uploaded photo.
  const details=value.details||[];
  const active=details.some(d=>d.id===selected)?selected:details[0]?.id;
  const place=(id:string,x:number,y:number)=>{
    const pocket=current.current.details?.find(d=>d.id===id)?.pocket;
    if(pocket){onChange(patchPocket(current.current,id,{box:{...pocket.box,x:Math.max(0,Math.min(1-pocket.box.width,x-pocket.box.width/2)),y:Math.max(0,Math.min(1-pocket.box.height,y-pocket.box.height/2))}}));setSelected(id);return;}
    onChange({...current.current,details:current.current.details?.map(d=>d.id===id?{...d,x:Math.round(x*10000)/10000,y:Math.round(y*10000)/10000}:d)});
    setSelected(id);
  };
  useEffect(()=>{
    const move=(e:PointerEvent)=>{if(dragging.current){e.preventDefault();setGhost({id:dragging.current,x:e.clientX,y:e.clientY});}};
    const up=(e:PointerEvent)=>{
      const id=dragging.current,b=surface.current?.getBoundingClientRect();
      if(id&&b&&e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom)place(id,(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height);
      dragging.current=null;setGhost(null);
    };
    const cancel=()=>{dragging.current=null;setGhost(null);};
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);};
  },[onChange]);
  const perform=async(action:()=>Promise<void>)=>{setError("");setBusy(true);try{await action();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="numbered-design-workspace">
    <header className="design-workspace-header"><div className="eyebrow">DESAIN & PRATINJAU</div><h2>Bayangkan perubahan pada pakaianmu.</h2><p>Unggah foto, coret area setiap detail, lalu tulis perubahan. SDXL membuat tiga variasi ilustrasi pada area tersebut. Pada perubahan yang didukung, sketsa tata letak membantu mengarahkan bentuk sebelum diproses AI.</p></header>
    <section className="design-photo-upload">
      {photo&&<figure className="base-design-photo"><img src={`/api/files/${photo}`} alt="Foto dasar yang diunggah"/><figcaption>Foto dasar aktif — satu gambar. Unggahan baru menggantikan foto dan penandanya.</figcaption></figure>}
      {uploadSlot}
    </section>
    {photo&&<>
      <fieldset disabled={busy} className="numbered-design-fields">
        <div className="active-detail-strip" aria-label="Pilih detail untuk dicoret">{details.map((d,i)=><button key={d.id} type="button" className={`button small ${active===d.id?"":"secondary"}`} onClick={()=>setSelected(d.id)}>Coretan detail {i+1}</button>)}</div>
        <DesignMarkupEditor photo={photo} value={value} onChange={onChange} activeDetailId={active} surfaceRef={surface} onPlaceDetail={place} onMarkerDragStart={id=>{dragging.current=id;setSelected(id);}}/>
        <section className="numbered-description-section"><h3>Detail desain yang diinginkan</h3><p>Tarik angka dari daftar ke canvas. Pilih nomor yang sama sebelum mencoret area detail tersebut.</p>
          <ol className="numbered-descriptions">{details.map((detail,index)=><li key={detail.id} className={active===detail.id?"active":""}>
            <div className="description-row-heading">
              <button type="button" className="detail-drag-handle" style={{background:["#56a82b","#4385d6","#dd9227","#a659c8"][index%4]}} draggable aria-label={`Tarik nomor ${index+1} ke canvas`} onClick={()=>setSelected(detail.id)}
                onDragStart={e=>{e.dataTransfer.setData("text/rupa-detail",detail.id);e.dataTransfer.effectAllowed="move";setSelected(detail.id);}}
                onPointerDown={e=>{if(e.pointerType!=="mouse"){e.preventDefault();dragging.current=detail.id;setSelected(detail.id);}}}
              >{index+1}</button>
              <strong>Detail {index+1}</strong><small>{detail.x===undefined?"Belum ditempatkan":"Nomor sudah di canvas"}</small>
              <button type="button" className="text-button" onClick={()=>place(detail.id,.5,.5)}>Letakkan di tengah</button>
              {details.length>1&&<button type="button" className="text-button" aria-label={`Hapus detail ${index+1}`} onClick={()=>onChange({...value,details:details.filter(d=>d.id!==detail.id),strokes:value.strokes.filter(s=>s.detailId!==detail.id)})}>Hapus</button>}
            </div>
            <label className="field"><span>Jenis perubahan {index+1}</span><select value={detail.pocket?"pocket":"free"} onChange={e=>{setSelected(detail.id);onChange(normalizePocketDetails({...value,strokes:value.strokes.filter(s=>s.detailId!==detail.id),details:details.map(d=>d.id===detail.id?{...d,text:"",pocket:e.target.value==="pocket"?newPocket(d.x,d.y):undefined}:d)}));}}><option value="free">Deskripsi bebas + coretan</option><option value="pocket">Tambahkan saku (bentuk terarah)</option></select></label>
            {detail.pocket?<PocketControls value={value} id={detail.id} index={index+1} onChange={onChange}/>:<label className="field"><span>Deskripsi detail {index+1}</span><textarea aria-label={`Deskripsi detail ${index+1}`} value={detail.text} maxLength={400} onFocus={()=>setSelected(detail.id)} onChange={e=>onChange({...value,details:details.map(d=>d.id===detail.id?{...d,text:e.target.value}:d)})} placeholder={index===0?"Contoh: tambahkan saku di dada kiri pemakai":"Contoh: tambahkan logo lingkaran merah di dekat saku"}/></label>}
          </li>)}</ol>
          <div className="form-actions"><button type="button" className="button secondary small" disabled={details.length>=8} onClick={()=>{const id=crypto.randomUUID();onChange({...value,details:[...details,{id,text:""}]});setSelected(id);}}>Tambah deskripsi</button>
            <button type="button" className="button secondary small" onClick={()=>perform(()=>onSave(value))}>Simpan detail & penanda</button>
            <button type="button" className="button" disabled={!ready} onClick={()=>perform(async()=>{
              if(!details.length)throw new Error("Tambahkan deskripsi terlebih dahulu.");
              for(const [i,d] of details.entries()){
                if(d.text.trim().length<5)throw new Error(`Lengkapi deskripsi detail ${i+1}, minimal 5 karakter.`);
                if(d.pocket){if(!d.pocket.confirmed)throw new Error(`Konfirmasi bentuk dan posisi saku pada detail ${i+1}.`);}
                else if(!value.strokes.some(s=>s.tool==="draw" && s.detailId===d.id))throw new Error(`Coret area untuk detail ${i+1} sebelum membuat pratinjau.`);
              }
              await onSubmit(value);
            })}>{busy?"Mengirim permintaan…":"Buat 3 variasi ilustrasi"}</button>

          </div>
          <p className="muted">Coretan menjadi mask untuk area yang boleh diubah. Piksel di luar mask dikembalikan dari foto asli. Hasil adalah ilustrasi; tekstur, bentuk detail, dan kelayakan jahit perlu diperiksa. Permintaan baru menggantikan hasil sebelumnya.</p>
          {!ready&&<p role="status">SDXL atau ControlNet belum siap. Detail dan penanda tetap bisa disimpan untuk konsultasi.</p>}
          {error&&<p role="alert" className="inline-error">{error}</p>}
        </section>
      </fieldset>
    </>}
    <details className="panel"><summary>Buat konsep pakaian dari teks</summary><p>Membuat gambar konsep baru dengan seluruh kanvas sebagai area generasi, bukan mengedit atau mempertahankan foto unggahan. Jelaskan pakaian lengkap.</p><label className="field"><span>Deskripsi konsep pakaian</span><textarea value={conceptPrompt} onChange={e=>setConceptPrompt(e.target.value)} maxLength={1000} placeholder="Kaos merah lengan pendek dengan satu saku biru di dada kiri, foto produk dengan latar putih"/></label><button type="button" className="button secondary" disabled={busy||!ready} onClick={()=>perform(async()=>{if(conceptPrompt.trim().length<5)throw new Error("Lengkapi deskripsi konsep minimal 5 karakter.");await onConcept(conceptPrompt);})}>Buat konsep dari teks</button></details>
    {error&&!photo&&<p role="alert" className="inline-error">{error}</p>}
    <section className="latest-design-result">{children}</section>
    {ghost&&<span className="dragging-detail-ghost" style={{left:ghost.x,top:ghost.y}}>{details.findIndex(d=>d.id===ghost.id)+1}</span>}
  </div>;
}
