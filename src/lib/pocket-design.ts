import type {DesignMarkup,PocketSpec} from "./design-markup";
export const pocketColors={navy:"Biru navy",black:"Hitam",cream:"Krem"};
export const pocketHex={navy:"#142746",black:"#26282b",cream:"#d9c4a1"};
export function pocketDescription(p:PocketSpec){
  const shape=p.shape==="rounded_bottom"?"rounded-bottom":"rectangular";
  return `Add one ${p.color} ${shape} fabric pocket with an open top, folded top hem and stitching on the left, right and bottom. Position and visual size follow the confirmed outline.${p.extra?` Note for tailor (not rendered): ${p.extra}`:""}`;
}
export function newPocket(x=.38,y=.36):PocketSpec{
  return {shape:"rectangular",color:"navy",box:{x:Math.max(0,Math.min(.84,x-.08)),y:Math.max(0,Math.min(.8,y-.1)),width:.16,height:.2},confirmed:false,extra:""};
}
export function normalizePocketDetails(markup:DesignMarkup):DesignMarkup{
  return {...markup,details:markup.details?.map(d=>d.pocket?{...d,text:pocketDescription(d.pocket),x:d.pocket.box.x+d.pocket.box.width/2,y:d.pocket.box.y+d.pocket.box.height/2}:d)};
}
export function patchPocket(markup:DesignMarkup,id:string,patch:Partial<PocketSpec>):DesignMarkup{
  return normalizePocketDetails({...markup,details:markup.details?.map(d=>d.id===id&&d.pocket?{...d,pocket:{...d.pocket,...patch,confirmed:patch.confirmed??false}}:d)});
}
