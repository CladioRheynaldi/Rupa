export function demoMenuEnabled(env:Readonly<Record<string,string|undefined>>=process.env):boolean{
  if(env.VERCEL)return false;
  try{
    if(!['localhost','127.0.0.1','[::1]'].includes(new URL(env.APP_URL||'http://127.0.0.1:3050').hostname))return false;
  }catch{return false;}
  return (env.APP_MODE||'demo')==='demo'||env.RUPA_DEMO_MENU==='1';
}
