import type {ActivityKey} from './config';
export type FormFieldText={en:string;ar:string;hintEn:string;hintAr:string};
export type FormSettings=Partial<Record<ActivityKey,FormFieldText>>;
