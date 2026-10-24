import { permanentRedirect } from "next/navigation";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const query=await searchParams,params=new URLSearchParams();
 for(const [key,value] of Object.entries(query)){if(Array.isArray(value))value.forEach(v=>params.append(key,v));else if(value!==undefined)params.set(key,value);}
 permanentRedirect("/survey"+(params.size?"?"+params.toString():""));
}
