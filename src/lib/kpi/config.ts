export const PROJECT = {
 id: "advacon-2026-q4", name: "ADVACON KPI & Project Progress", start: "2026-10-01", end: "2026-12-31", timezone: "Asia/Riyadh",
 weeklyIrrigationTarget: 64000,
 targets: { irrigation: 832000, pruning: 16000, compost: 16000, treeBase: 16000, waste: 350 },
 weeks: [
  ["2026-10-01","2026-10-10"],["2026-10-11","2026-10-17"],["2026-10-18","2026-10-24"],["2026-10-25","2026-10-31"],
  ["2026-11-01","2026-11-07"],["2026-11-08","2026-11-14"],["2026-11-15","2026-11-21"],["2026-11-22","2026-11-28"],
  ["2026-11-29","2026-12-05"],["2026-12-06","2026-12-12"],["2026-12-13","2026-12-19"],["2026-12-20","2026-12-26"],["2026-12-27","2026-12-31"],
 ].map(([start,end],index)=>({id:`W${String(index+1).padStart(2,'0')}`,index,start,end})),
 months: [{id:"2026-10",label:"October 2026",start:"2026-10-01",end:"2026-10-31"},{id:"2026-11",label:"November 2026",start:"2026-11-01",end:"2026-11-30"},{id:"2026-12",label:"December 2026",start:"2026-12-01",end:"2026-12-31"}],
} as const;
export const ACTIVITY_FIELDS = [
 {key:"foremen",label:"Number of Foremen",section:"Manpower",unit:"people",integer:true},
 {key:"labourers",label:"Number of Labourers",section:"Manpower",unit:"people",integer:true},
 {key:"trees_irrigated",label:"Trees Irrigated",section:"Water Supply",unit:"trees",integer:true},
 {key:"vegetable_basins_irrigated",label:"Vegetable Basins Irrigated",section:"Water Supply",unit:"basins",integer:true},
 {key:"date_palm_pruning",label:"Date Palm Pruning",section:"Integrated Crop Management",unit:"trees",integer:true},
 {key:"tree_pruning",label:"Pruning of Trees",section:"Integrated Crop Management",unit:"trees",integer:true},
 {key:"compost_fertilization",label:"Compost Fertilization",section:"Integrated Crop Management",unit:"trees",integer:true},
 {key:"date_palm_basin_management",label:"Date Palm Basin Management",section:"Integrated Crop Management",unit:"trees",integer:true},
 {key:"tree_base_management",label:"Tree Base Management",section:"Integrated Crop Management",unit:"trees",integer:true},
 {key:"vegetable_basins_management",label:"Vegetable Basins Management",section:"Integrated Crop Management",unit:"basins",integer:true},
 {key:"cleaned_area_ha",label:"Total Cleaned Area",section:"Waste Management",unit:"ha",integer:false},
 {key:"dayna_trips",label:"Waste Collected Dayna",section:"Waste Management",unit:"trips",integer:true},
 {key:"truck_trips",label:"Waste Collected Truck",section:"Waste Management",unit:"trips",integer:true},
 {key:"vegetable_harvest_kg",label:"Harvesting of Vegetables",section:"Harvesting",unit:"kg",integer:false},
] as const;
export type ActivityKey = typeof ACTIVITY_FIELDS[number]['key'];
export type KpiKey = keyof typeof PROJECT.targets;
export type Totals = Record<KpiKey,number>;
export type DailyKpiReport = {id:string;project_id:string;report_date:string;updated_at?:string;deleted_at?:string|null;[field:string]:unknown};
export const REPORTING_MODES = [{id:'daily',label:'Daily Progress'},{id:'weekly',label:'Weekly Progress'},{id:'monthly',label:'Monthly Progress'},{id:'project',label:'Full Project Progress'},{id:'custom',label:'Custom Period Progress'}] as const;
export type ReportingMode=typeof REPORTING_MODES[number]['id'];
export const FIELD_HINTS: Partial<Record<ActivityKey,string>> = {
 date_palm_pruning: 'Date palms only: a breakdown already included in the all-tree pruning total below.',
 tree_pruning: 'ALL pruned trees: date palms + native + fruit trees. Do not add date palms twice.',
 compost_fertilization: 'ALL trees composted: date palms + native + fruit trees. Independent of pruning.',
 date_palm_basin_management: 'Date palm trees only; counted separately from other tree bases.',
 tree_base_management: 'Other/native/fruit tree bases only; exclude date palms entered above.',
 vegetable_basins_management: 'Operational basin count only; excluded from the 16,000-tree KPI.',
};
