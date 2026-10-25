import type {ActivityKey} from './config';
export type FormFieldText={en:string;ar:string;hintEn:string;hintAr:string;hidden?:boolean};
export type CustomField={id:string;en:string;ar:string;required:boolean;hidden?:boolean};
export type FormSettings=Partial<Record<ActivityKey|'location'|'notes',FormFieldText>>&{custom?:CustomField[]};
