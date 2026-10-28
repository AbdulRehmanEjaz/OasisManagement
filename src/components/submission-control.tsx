"use client";
import {useState} from 'react';
import {api,type Row} from '@/lib/client';
import {Button} from './ui/button';
export default function SubmissionControl({controls,onSaved}:{controls:Row[];onSaved:()=>void}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 return <section className="records-card" style={{padding:24}}><h2>Submission &amp; View Control</h2><p className="muted">Control Supervisor submissions and Viewer access for each Survey category. Admin access remains available.</p>{error&&<p className="notice error" role="alert">{error}</p>}{[['waste','Waste Reports'],['inspection','Facilities Tracking'],['palms','Date Palms Tracking']].map(([kind,label])=>{const r=controls.find(c=>c.kind===kind);return <div className="survey-control-row" key={kind}><strong>{label}</strong>{(['submission_enabled','viewer_enabled'] as const).map(key=><Button key={key} role="switch" aria-checked={!!r?.[key]} aria-label={label+' '+(key==='submission_enabled'?'Supervisor submissions':'Viewer access')} variant={r?.[key]?'default':'outline'} disabled={!r||!!busy} onClick={async()=>{if(!r)return;setBusy(kind);setError('');try{await api('control.save',{kind,submission_enabled:!!r.submission_enabled,viewer_enabled:!!r.viewer_enabled,[key]:!r[key]});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>{key==='submission_enabled'?'Supervisor submission':'Viewer access'}: {r?.[key]?'Allowed':'Blocked'}</Button>)}</div>;})}</section>;
}
