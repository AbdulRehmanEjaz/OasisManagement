import {PROJECT,ACTIVITY_FIELDS,type DailyKpiReport,type ReportingMode,type Totals,type KpiKey,type ActivityKey} from './config';
export function saudiDate(now=new Date()):string {
 const parts=new Intl.DateTimeFormat('en',{timeZone:PROJECT.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(key=>parts.find(p=>p.type===key)!.value).join('-');
}
export function validDate(value:string):boolean {return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function projectDate(value:string):string {return value<PROJECT.start?PROJECT.start:value>PROJECT.end?PROJECT.end:value;}
export function getProjectWeek(date:string){return PROJECT.weeks.find(week=>date>=week.start&&date<=week.end);}
export function getPreviousProjectWeek(week:typeof PROJECT.weeks[number]){return PROJECT.weeks[week.index-1];}
export type ReportingFilter={mode:ReportingMode;date?:string;week?:string;month?:string;start?:string;end?:string};
export function reportingRange(filter:ReportingFilter,today=saudiDate()){
 let start:string,end:string;
 if(filter.mode==='daily'){start=end=filter.date||projectDate(today);}
 else if(filter.mode==='weekly'){const week=PROJECT.weeks.find(w=>w.id===filter.week)||getProjectWeek(projectDate(today))!;start=week.start;end=week.end;}
 else if(filter.mode==='monthly'){const month=PROJECT.months.find(m=>m.id===filter.month)||PROJECT.months.find(m=>m.id===projectDate(today).slice(0,7))!;start=month.start;end=month.end;}
 else if(filter.mode==='project'){start=PROJECT.start;end=PROJECT.end;}
 else {start=filter.start||PROJECT.start;end=filter.end||projectDate(today);}
 if(!validDate(start)||!validDate(end)||start<PROJECT.start||end>PROJECT.end||start>end)throw new Error('Choose a valid date range within 01 Oct–31 Dec 2026.');
 return {start,end,cutoff:[end,today,PROJECT.end].sort()[0]};
}
export function uniqueProjectReports(reports:DailyKpiReport[]){
 const unique=new Map<string,DailyKpiReport>();
 for(const report of reports){if(!report.id)continue;
  const previous=unique.get(report.id);if(!previous||String(report.updated_at||'')>=String(previous.updated_at||''))unique.set(report.id,report);
 }
 return [...unique.values()].filter(report=>report.project_id===PROJECT.id&&!report.deleted_at&&validDate(report.report_date)&&report.report_date>=PROJECT.start&&report.report_date<=PROJECT.end);
}
export function reportsInRange(reports:DailyKpiReport[],start:string,end:string){return uniqueProjectReports(reports).filter(r=>r.report_date>=start&&r.report_date<=end);}
const amount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
export function aggregateDailyReports(reports:DailyKpiReport[]){
 const operations=Object.fromEntries(ACTIVITY_FIELDS.map(f=>[f.key,0])) as Record<ActivityKey,number>;
 for(const report of uniqueProjectReports(reports))for(const f of ACTIVITY_FIELDS)operations[f.key]+=amount(report[f.key]);
 const totals:Totals={irrigation:operations.trees_irrigated,pruning:operations.tree_pruning,compost:operations.compost_fertilization,treeBase:operations.date_palm_basin_management+operations.tree_base_management,waste:operations.cleaned_area_ha};
 const direct=uniqueProjectReports(reports).reduce((v,r)=>({dayna:v.dayna+amount(r.dayna_m3),truck:v.truck+amount(r.truck_m3)}),{dayna:0,truck:0});
 const daynaM3=operations.dayna_trips*3+direct.dayna,truckM3=operations.truck_trips*12+direct.truck;
 return {operations,totals,daynaM3,truckM3,wasteCollectionM3:daynaM3+truckM3};
}
export function calculateKpiPercentages(totals:Totals):Totals {return Object.fromEntries(Object.entries(PROJECT.targets).map(([key,target])=>[key,amount(totals[key as KpiKey])/target*100])) as Totals;}
export function calculateMainKpis(kpis:Totals){return {water:kpis.irrigation,icm:(kpis.pruning+kpis.compost+kpis.treeBase)/3,waste:kpis.waste};}
export function calculateOverallCompletion(main:ReturnType<typeof calculateMainKpis>){return (main.water+main.icm+main.waste)/3;}
export function calculateRemainingWork(totals:Totals):Totals{return Object.fromEntries(Object.entries(PROJECT.targets).map(([key,target])=>[key,Math.max(0,target-amount(totals[key as KpiKey]))])) as Totals;}
export function calculateDashboard(reports:DailyKpiReport[],filter:ReportingFilter,today=saudiDate()){
 const eligible=uniqueProjectReports(reports),range=reportingRange(filter,today);
 const period=aggregateDailyReports(reportsInRange(eligible,range.start,[range.end,range.cutoff].sort()[0]));
 const cumulative=aggregateDailyReports(reportsInRange(eligible,PROJECT.start,range.cutoff));
 const week=getProjectWeek(projectDate(range.cutoff))!,previous=getPreviousProjectWeek(week);
 const thisWeek=aggregateDailyReports(reportsInRange(eligible,week.start,[week.end,range.cutoff].sort()[0])).totals;
 const lastWeek=aggregateDailyReports(previous?reportsInRange(eligible,previous.start,[previous.end,range.cutoff].sort()[0]):[]).totals;
 const percentages=calculateKpiPercentages(cumulative.totals),main=calculateMainKpis(percentages);
 return {range,period,cumulative,week,previous,thisWeek,lastWeek,percentages,main,overall:calculateOverallCompletion(main),remaining:calculateRemainingWork(cumulative.totals),irrigationGauge:filter.mode==='weekly'?period.totals.irrigation/PROJECT.weeklyIrrigationTarget*100:percentages.irrigation,reportCount:reportsInRange(eligible,range.start,[range.end,range.cutoff].sort()[0]).length};
}
