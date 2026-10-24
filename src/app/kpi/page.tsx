import {redirect} from 'next/navigation';
import {requirePanel} from '@/lib/panels';
import KpiApp from '@/components/kpi/app';
import './kpi.css';
export const dynamic='force-dynamic';
export const metadata={title:'ADVACON · KPI & Project Progress',description:'October–December 2026 daily activity, KPI and project progress tracking.'};
export default async function Page(){let profile;try{profile=await requirePanel();}catch{redirect('/kpi/login');}const {tokenHash:_,...safe}=profile;return <KpiApp profile={safe}/>;}
