import "server-only";
import { cookies } from "next/headers";
import { getBindings } from "@/lib/runtime";
import { D1Store, HttpError,type Dashboard } from './d1-store';
export const cookieFor=(dashboard:Dashboard)=>process.env.NODE_ENV==='production'?`__Host-${dashboard}-session`:`${dashboard}-panel-session`;
export const sessionCookie=cookieFor('survey');
export async function store(dashboard:Dashboard='survey'){
 const env=await getBindings();if(!env.DB)throw new HttpError('D1 is not bound. Complete the Cloudflare database setup.',503);
 return new D1Store(env.DB,env.PIN_LOOKUP_SECRET||process.env.PIN_LOOKUP_SECRET||'',dashboard);
}
export async function requireUser(admin=false,dashboard:Dashboard='survey'){
 const db=await store(dashboard),profile=await db.session((await cookies()).get(cookieFor(dashboard))?.value||'');
 if(admin&&profile.role!=='admin')throw new HttpError('FORBIDDEN',403);
 return {db,profile,user:{id:profile.id}};
}
