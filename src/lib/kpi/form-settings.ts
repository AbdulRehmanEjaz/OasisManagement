import type {ActivityKey} from './config';
export type FormFieldText={en:string;ar:string;hintEn:string;hintAr:string;hidden?:boolean};
export type FormSection={id:string;en:string;ar:string};
export type CustomField={id:string;en:string;ar:string;required:boolean;hidden?:boolean;section?:string;numeric?:boolean;unit?:string};
export const DEFAULT_SECTIONS:FormSection[]=[
 {id:'manpower',en:'Manpower',ar:'القوى العاملة'},
 {id:'water-supply',en:'Water Supply',ar:'إمدادات المياه'},
 {id:'crop-management',en:'Integrated Crop Management',ar:'الإدارة المتكاملة للمحاصيل'},
 {id:'waste-management',en:'Waste Management',ar:'إدارة النفايات'},
 {id:'harvesting',en:'Harvesting',ar:'الحصاد'},
 {id:'additional',en:'Additional Information',ar:'معلومات إضافية'},
];
export const sectionId=(section:string)=>({Manpower:'manpower','Water Supply':'water-supply','Integrated Crop Management':'crop-management','Waste Management':'waste-management',Harvesting:'harvesting'}[section]||'additional');
export function orderedSections(settings:FormSettings):FormSection[]{
 const overrides=new Map((settings.sections||[]).map(section=>[section.id,section]));
 const all=[...DEFAULT_SECTIONS.map(section=>overrides.get(section.id)||section),...(settings.sections||[]).filter(section=>!DEFAULT_SECTIONS.some(base=>base.id===section.id))];
 const unique=all.filter((s,index)=>all.findIndex(other=>other.id===s.id)===index);
 const order=settings.sectionOrder||[];
 return [...unique].sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});
}
export type FormSettings=Partial<Record<ActivityKey|'location'|'notes',FormFieldText>>&{custom?:CustomField[];sections?:FormSection[];sectionOrder?:string[]};
