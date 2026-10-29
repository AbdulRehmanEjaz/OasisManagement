import type {DailyKpiReport} from '@/lib/kpi/config';
export default function WasteVolume({report,field,ar=false}:{report:DailyKpiReport;field:'dayna_trips'|'truck_trips';ar?:boolean}){
 const direct=report.volume_unit==='m3',capacity=field==='dayna_trips'?3:12;
 const value=Number(report[direct?(field==='dayna_trips'?'dayna_m3':'truck_m3'):field]||0);
 const fmt=(n:number)=>n.toLocaleString(ar?'ar-SA':'en-GB',{maximumFractionDigits:10});
 return <span><strong>{fmt(direct?value:value*capacity)} m³</strong><small style={{display:'block',fontWeight:400,marginTop:4}}>{direct?(ar?'حجم مستورد بالمتر المكعب · دون تحويل':'Imported volume in m³ · no conversion'):<span dir="ltr">{fmt(value)} {ar?'رحلات':'trips'} × {capacity} = {fmt(value*capacity)} m³</span>}</small></span>;
}
