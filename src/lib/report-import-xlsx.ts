import { XMLParser } from "fast-xml-parser";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { z } from "zod";
import { structureTypes, submissionWasteTypes } from "./validation";
export const importHeaders = {
 waste: ["Date", "Waste Type", "Weight (kg)", "Latitude", "Longitude", "Photo URL 1", "Photo URL 2"],
 inspection: ["Date", "Site Name", "Type of Structure", "Latitude", "Longitude", "Photo URL 1", "Photo URL 2"],
};
export type ImportKind = keyof typeof importHeaders;
export function publicPhotoUrl(value:string) {
 const url=new URL(value);
 const host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||url.port||!host.includes('.')||host.includes(':')||/^\d+(\.\d+){3}$/.test(host)||/(^|\.)(localhost|local|internal|invalid|test)$/.test(host)||host.endsWith('.localhost')||host.startsWith('['))throw new Error("Use a public HTTPS link directly to a JPEG, PNG or WebP photo.");
 return url.href;
}
const dateValue=z.preprocess(v=>{
 if(typeof v==='number'||(typeof v==='string'&&/^\d{5}(\.\d+)?$/.test(v)))return new Date((Number(v)-25569)*86400000).toISOString();
 if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)){const d=new Date(v+'T00:00:00Z');if(Number.isFinite(+d)&&d.toISOString().slice(0,10)===v)return d.toISOString();}
 return v;
},z.iso.datetime({offset:true}));
export const importRowSchema=z.object({
 date:dateValue,site:z.string().trim().max(200).default(''),category:z.string().trim().max(100).default(''),quantity:z.coerce.number().positive().max(100000000).optional(),structure_type:z.enum(structureTypes).optional(),
 latitude:z.coerce.number().min(-90).max(90),longitude:z.coerce.number().min(-180).max(180),
 photos:z.array(z.string().transform(publicPhotoUrl)).min(1).max(2).refine(a=>new Set(a).size===a.length,'Photo URLs must be distinct'),
 key:z.string().regex(/^[a-f0-9]{64}-\d{1,4}$/),
});
export type ImportRow=z.infer<typeof importRowSchema>;
export function validateImportRow(kind:ImportKind,value:unknown):ImportRow{
 const row=importRowSchema.parse(value);
 if(kind==='waste'&&(!row.category||!row.quantity))throw new Error('Waste Type and Weight (kg) are required.');
 if(kind==='inspection'&&(!row.site||!row.structure_type))throw new Error('Site Name and Type of Structure are required.');
 return row;
}
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,processEntities:true});
const array=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
function parseXml(bytes:Uint8Array|undefined){if(!bytes)return {};const text=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported XML declarations.');return parser.parse(text);}
function text(v:any):string{return v==null?'':typeof v==='object'?String(v['#text']??''):String(v);}
function rich(v:any):string{return v?.t!==undefined?text(v.t):array(v?.r).map(r=>text(r.t)).join('');}
export async function parseImportWorkbook(kind:ImportKind,bytes:Uint8Array){
 if(bytes.length>2*1024*1024)throw new Error('Choose an .xlsx file smaller than 2 MB (photo links only).');
 const files=unzipSync(bytes,{filter:f=>{if(!['xl/worksheets/sheet1.xml','xl/sharedStrings.xml'].includes(f.name))return false;if(f.originalSize>4*1024*1024)throw new Error('Workbook contents are too large.');return true;}});
 if(!files['xl/worksheets/sheet1.xml'])throw new Error('Use the downloaded .xlsx template and its first worksheet.');
 const strings=array(parseXml(files['xl/sharedStrings.xml']).sst?.si).map(rich);
 const sheet=parseXml(files['xl/worksheets/sheet1.xml']).worksheet;
 const rows=array(sheet?.sheetData?.row).map(r=>{
  const cells:string[]=[];
  for(const c of array(r.c)){if(c.f!==undefined)throw new Error('Use values only; formulas are not supported in imports.');const column=/^([A-Z]+)\d+$/.exec(c['@_r']||'')?.[1];if(!column)throw new Error('Invalid spreadsheet cell reference.');let index=0;for(const ch of column)index=index*26+ch.charCodeAt(0)-64;index--;if(index>20)continue;cells[index]=c['@_t']==='s'?strings[Number(c.v)]??'':c['@_t']==='inlineStr'?rich(c.is):text(c.v);}
  return cells;
 });
 if(!rows.length||importHeaders[kind].some((h,i)=>rows[0][i]?.trim()!==h))throw new Error('Column headers do not match this category. Download its template first.');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');
 const records:ImportRow[]=[],errors:string[]=[];
 for(let i=1;i<rows.length;i++){
  const cells=rows[i];if(!cells.some(v=>String(v??'').trim()))continue;
  if(records.length+errors.length>=100)throw new Error('Import at most 100 reports per file.');
  try{if(!cells[3]?.trim()||!cells[4]?.trim())throw new Error('Latitude and Longitude are required.');records.push(validateImportRow(kind,{date:cells[0],...(kind==='waste'?{category:cells[1],quantity:cells[2]}:{site:cells[1],structure_type:cells[2]}),latitude:cells[3],longitude:cells[4],photos:[cells[5],cells[6]].filter(v=>v?.trim()).map(v=>v.trim()),key:digest+'-'+(i+1)}));}
  catch(e){errors.push('Row '+(i+1)+': '+(e instanceof z.ZodError?e.issues.map(v=>v.path.join('.')+': '+v.message).join('; '):(e as Error).message));}
 }
 if(errors.length)throw new Error(errors.join('\n'));
 if(!records.length)throw new Error('The template is empty. Fill at least one report row.');
 return records;
}
const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function importTemplate(kind:ImportKind){
 const headers=importHeaders[kind];const values=[headers,...Array.from({length:20},()=>headers.map(()=>''))];
 const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships',pkg='http://schemas.openxmlformats.org/package/2006/relationships';
 const instructions=[['How to fill this template'],['Fill the Reports sheet; keep headers unchanged. Do not enter report codes: the system assigns them.'],['Date: YYYY-MM-DD, or an Excel date cell. Latitude / Longitude: decimal degrees.'],['Photo URL 1 is required. Photo URL 2 is optional. Use direct public HTTPS JPEG, PNG or WebP image links, not gallery/share pages.'],['All rows are validated before import. Up to 100 rows per file. Same-file retries skip reports already imported.'],[kind==='waste'?'Weight is kilograms only. Waste Type: '+submissionWasteTypes[0]:'Type of Structure: '+structureTypes.join(' | ')],['Imported coordinates are labelled Excel import, not verified hardware GPS.']];
 const sheet=(rows:unknown[][])=>`<worksheet xmlns="${main}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="3" width="38" customWidth="1"/><col min="4" max="5" width="19" customWidth="1"/><col min="6" max="7" width="55" customWidth="1"/></cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}" ht="32" customHeight="1">${r.map((v,c)=>`<c r="${String.fromCharCode(65+c)}${i+1}" s="${i===0?1:0}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
 const parts:Record<string,string>={
 '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${[1,2].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
 '_rels/.rels':`<Relationships xmlns="${pkg}"><Relationship Id="workbook" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
 'xl/workbook.xml':`<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="Reports" sheetId="1" r:id="s1"/><sheet name="Instructions" sheetId="2" r:id="s2"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':`<Relationships xmlns="${pkg}">${[1,2].map(i=>`<Relationship Id="s${i}" Type="${rel}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
 'xl/styles.xml':`<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF165844"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
 'xl/worksheets/sheet1.xml':sheet(values),'xl/worksheets/sheet2.xml':sheet(instructions),
 };
 return zipSync(Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+v)])));
}
