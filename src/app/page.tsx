import { ArrowUpRight, Leaf, LockKeyhole, Recycle, Sprout, HardHat, MapPin, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
export const metadata = { title: "Oasis · Operations Hub", description: "Your connected workspace for field operations, farm performance, and workforce management." };
function Scene({ kind }: {kind: "field" | "farms" | "people"}) {
 return <svg viewBox="0 0 440 250" fill="none" aria-hidden="true" className="hub-scene">
 <defs><linearGradient id={kind+"sky"} x1="220" y1="0" x2="220" y2="250" gradientUnits="userSpaceOnUse"><stop stopColor={kind==="field"?"#e9d5aa":"#dde4df"}/><stop offset="1" stopColor={kind==="field"?"#f8edcf":"#f2f3ed"}/></linearGradient></defs>
 <rect width="440" height="250" fill={"url(#"+kind+"sky)"}/><circle cx="344" cy="51" r="24" fill={kind==="field"?"#fcf2cf":"#f9f9f3"}/>
 <path d="M0 155L48 92 76 108 108 58 145 76 182 138 236 104 292 145 334 95 376 125 440 85V250H0Z" fill={kind==="field"?"#b98b61":"#b9c4b8"}/><path d="M0 186L80 143 140 170 227 138 294 176 364 145 440 166V250H0Z" fill={kind==="field"?"#7a8e61":"#8d9e8b"}/>
 {kind==="field"?<>
 <path d="M0 205Q122 164 232 210T440 194V250H0Z" fill="#265b42"/><path d="M0 236Q117 192 238 235T440 224V250H0Z" fill="#173f30"/>
 <path d="M106 190L111 106M109 119Q72 93 54 122M110 115Q97 72 68 84M111 111Q133 73 155 88M112 119Q147 99 168 127" stroke="#284d35" strokeWidth="7" strokeLinecap="round"/>
 <path d="M311 198L307 127M308 140Q279 117 263 139M307 135Q301 103 278 111M308 134Q326 105 346 116M308 141Q340 125 354 146" stroke="#244c35" strokeWidth="6" strokeLinecap="round"/>
 <rect x="171" y="151" width="65" height="54" rx="5" fill="#f5e8cd"/><path d="M164 153L203 130 242 153" fill="#c8a675"/><rect x="194" y="174" width="16" height="31" rx="2" fill="#315d44"/>
 <path d="M256 208L260 181H280L284 208Z" fill="#d8b773"/><path d="M258 178H282M267 172H274" stroke="#eed4a2" strokeWidth="4" strokeLinecap="round"/>
 </>:kind==="farms"?<>
 <path d="M0 210L159 160 440 208V250H0Z" fill="#748b70"/><path d="M-10 241L172 177M55 255L211 185M135 261L251 194M222 260L297 203M311 264L344 212" stroke="#d4dec6" strokeWidth="10"/>
 <rect x="246" y="58" width="142" height="103" rx="14" fill="#f6f7f1" stroke="#a5b5a1"/><path d="M268 135V114M294 135V99M320 135V107M346 135V80" stroke="#7c9677" strokeWidth="12" strokeLinecap="round"/><path d="M265 87L295 73 320 81 351 61" stroke="#bcaa76" strokeWidth="3" strokeLinecap="round"/>
 <path d="M103 191V148M103 166Q75 163 79 143Q105 141 103 166ZM105 153Q108 127 130 130Q135 151 105 153Z" stroke="#d1ddc7" strokeWidth="4" fill="#a4ba93"/>
 </>:<>
 <path d="M0 216Q142 180 440 205V250H0Z" fill="#a0aa9b"/>
 <rect x="232" y="174" width="105" height="32" rx="16" fill="#657465"/><circle cx="254" cy="190" r="7" fill="#d8ded1"/><circle cx="315" cy="190" r="7" fill="#d8ded1"/>
 <path d="M244 174V136H286L304 174" fill="#c7b581"/><path d="M253 144H279L289 162H253Z" fill="#677a6b"/>
 <path d="M290 143L326 100 370 145" stroke="#c7b581" strokeWidth="13" strokeLinejoin="round"/><path d="M365 139L388 154 374 173 351 166Z" fill="#7f8a75"/>
 <circle cx="130" cy="137" r="19" fill="#dfcdae"/><path d="M109 131Q111 107 130 107Q150 107 152 131Z" fill="#c8b476"/><path d="M98 212V182Q98 159 130 159Q162 159 162 182V212" fill="#536f5a"/><path d="M117 162L130 186 143 162M115 183V210M145 183V210" stroke="#d2c38f" strokeWidth="6"/>
 </>}
 </svg>;
}
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const query=await searchParams;
 if(typeof query.view==="string"&&["waste","facilities","inspections","dashboard","users","settings","notifications"].includes(query.view)) {
  const params=new URLSearchParams({view:query.view});if(typeof query.record==="string")params.set("record",query.record);redirect("/oasis?"+params);
 }
 return <main className="operations-hub">
 <header className="hub-header"><a href="/" className="hub-brand"><span><Leaf size={25}/></span><div>oasis<span>OPERATIONS HUB</span></div></a><div className="hub-header-note"><span/>Connected operations</div></header>
 <section className="hub-intro"><span className="hub-eyebrow">YOUR OPERATIONS. ONE WORKSPACE.</span><h1>Clarity for every<br/><em>part of the field.</em></h1><p>From site observations to the people behind the work.<br className="hub-desktop-break"/> Choose your dashboard and get things moving.</p></section>
 <section className="hub-cards" aria-label="Operations dashboards">
 <a className="hub-card hub-card-active" href="/oasis"><div className="hub-card-art"><Scene kind="field"/><span className="hub-status"><span/>Available now</span><span className="hub-card-index">01</span></div><div className="hub-card-content"><div className="hub-icon"><Recycle size={23}/><MapPin size={16}/></div><h2>Oasis Domestic Waste<br/>&amp; Site Survey</h2><p>Report waste, document site facilities, and see every observation on the map.</p><div className="hub-tags"><span>Waste reporting</span><span>Site survey</span></div><footer><span>Open dashboard</span><span className="hub-open"><ArrowUpRight size={22}/></span></footer></div></a>
 <article className="hub-card hub-card-soon" aria-disabled="true"><div className="hub-card-art"><Scene kind="farms"/><span className="hub-status"><LockKeyhole size={12}/>Coming soon</span><span className="hub-card-index">02</span></div><div className="hub-card-content"><div className="hub-icon"><Sprout size={25}/></div><h2>Oasis Active Farms<br/>KPIs &amp; Performance Tracking</h2><p>A clearer view of active farms, operational performance, and progress in the oasis.</p><div className="hub-tags"><span>Farm KPIs</span><span>Performance</span></div><footer><span>Growing next</span><LockKeyhole size={18}/></footer></div></article>
 <article className="hub-card hub-card-soon" aria-disabled="true"><div className="hub-card-art"><Scene kind="people"/><span className="hub-status"><LockKeyhole size={12}/>Coming soon</span><span className="hub-card-index">03</span></div><div className="hub-card-content"><div className="hub-icon"><HardHat size={25}/></div><h2>Manpower &amp; Equipment<br/>Management</h2><p>Bring teams, equipment, and daily resource planning together in one place.</p><div className="hub-tags"><span>Workforce</span><span>Equipment</span></div><footer><span>Taking shape</span><LockKeyhole size={18}/></footer></div></article>
 </section>
 <footer className="hub-footer"><span>Rooted in the oasis. Built for the field.</span><span><ShieldCheck size={15}/>Secure PIN access inside each active dashboard</span></footer>
 </main>;
}
