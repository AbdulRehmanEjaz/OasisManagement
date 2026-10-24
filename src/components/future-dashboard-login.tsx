import { ArrowLeft, Clock3 } from "lucide-react";
export default function FutureDashboardLogin({title}:{title:string}) {
 return <main className="pin-login">
  <a className="pin-brand" href="/" aria-label="Back to Operations Hub"><img src="/branding/advacon-alula-oasis-transparent.png" width="330" height="110" alt="ADVACON and AlUla Oasis Management"/></a>
  <section className="pin-card"><span className="pin-lock"><Clock3 size={26}/></span><h1>{title}</h1><p>Coming soon</p><p>This dashboard is under development. Login will be available when it launches.</p><a href="/" className="btn"><ArrowLeft size={18}/>Back to Operations Hub</a></section>
 </main>;
}
