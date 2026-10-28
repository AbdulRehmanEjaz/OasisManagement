import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { trustedPhotoUrl } from "./photo-zip";
export type ExcelReport = {number:string;created_at:string;site?:string;category?:string;quantity?:number;latitude:number;longitude:number;photos:{url:string}[]};
const esc=(v:unknown)=>String(v??"").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relns='http://schemas.openxmlformats.org/package/2006/relationships';
const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export async function* reportExcel(kind:"waste"|"inspection",reports:AsyncIterable<ExcelReport>,signal:AbortSignal,fetchPhoto:typeof fetch=fetch,onPhotoError?:(report:ExcelReport,error:Error)=>void):AsyncGenerator<Uint8Array>{
 const queue:Uint8Array[]=[]; const zip=new Zip((e,c)=>{if(e)throw e;queue.push(c);});
 let total=0,files=0;
 function add(name:string,data:string|Uint8Array){const bytes=typeof data==='string'?strToU8(data):data;total+=bytes.length;if(total>0xffffffff-16777216||++files>65535)throw new Error('Excel archive is too large.');const file=new ZipPassThrough(name);zip.add(file);file.push(bytes,true);}
 const headers=kind==='waste'?['Date','Report Code','Waste type','Weight(kg)','Latitude','Longitude','Location G-maps link','Site Photo']:['Date','Report Code','Site Name','Longitude','Latitude','Type of Structure','G-Map Link','Site Photo'];
 headers.push('Photo Status','Photo 1 - ImgBB URL','Photo 2 - ImgBB URL','Photo 3 - ImgBB URL');
 const cell=(col:number,row:number,value:unknown,style=0)=>{const ref=String.fromCharCode(65+col)+row;return typeof value==='number'&&Number.isFinite(value)?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;};
 let rows=`<row r="1" ht="30" customHeight="1">${headers.map((h,i)=>cell(i,1,h,1)).join('')}</row>`,links='',sheetRels='',drawings='',drawingRels='',imageCount=0,row=1;
 try{
 for await(const report of reports){
  signal.throwIfAborted();row++;if(row>1048576)throw new Error('Excel row limit exceeded.');
  const link=`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`;
  const date=(Date.parse(report.created_at)+10800000)/86400000+25569;
  const values=kind==='waste'?[date,report.number,report.category,report.quantity,report.latitude,report.longitude,'Open in Google Maps','']:[date,report.number,report.site,report.longitude,report.latitude,'','Open in Google Maps',''];

  links+=`<hyperlink ref="G${row}" r:id="link${row}"/>`;sheetRels+=`<Relationship Id="link${row}" Type="${office}hyperlink" Target="${esc(link)}" TargetMode="External"/>`;
  const missing:number[]=[];
  for(let index=0;index<report.photos.length;index++){
   let bytes:Uint8Array,ext:string|null;
   try{
   const response=await fetchPhoto(trustedPhotoUrl(report.photos[index].url),{redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
   if(!response.ok)throw new Error(`Could not download photo for ${report.number}. Retry the export.`);
   const mime=response.headers.get('content-type')?.split(';')[0];ext=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':null;
   if(!ext)throw new Error(`Photo for ${report.number} must be JPEG or PNG for Excel.`);
   bytes=new Uint8Array(await response.arrayBuffer());
   }catch(e){if(!onPhotoError||signal.aborted)throw e;onPhotoError(report,e as Error);missing.push(index+1);values[7]='Original photos unavailable: '+missing.map(n=>report.number+'-'+String(n).padStart(2,'0')).join(', ');continue;}
   imageCount++;
   add(`xl/media/image${imageCount}.${ext}`,bytes);while(queue.length)yield queue.shift()!;
   // Preserve aspect ratio inside a compact, fixed photo cell.
   let width=120,height=85;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   if(ext==='png'&&bytes.length>=24){width=view.getUint32(16);height=view.getUint32(20);}
   else if(ext==='jpg'){for(let p=2;p+8<bytes.length;){if(bytes[p]!==255)break;const marker=bytes[p+1];if([192,193,194].includes(marker)){height=view.getUint16(p+5);width=view.getUint16(p+7);break;}const length=view.getUint16(p+2);if(length<2)break;p+=2+length;}}
   const scale=Math.min(115/width,85/height),cx=Math.round(width*scale*9525),cy=Math.round(height*scale*9525);
   drawings+=`<xdr:oneCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>${(index*120+4)*9525}</xdr:colOff><xdr:row>${row-1}</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${imageCount}" name="${esc(report.number)}-${index+1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="img${imageCount}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
   drawingRels+=`<Relationship Id="img${imageCount}" Type="${office}image" Target="../media/image${imageCount}.${ext}"/>`;
  }
  values.push(missing.length?'Missing original photos: '+missing.map(n=>report.number+'-'+String(n).padStart(2,'0')).join(', '):report.photos.length+' original photo(s) embedded');
  for(let index=0;index<3;index++){
   const url=report.photos[index]?.url||'';values.push(url);
   if(url){const ref=String.fromCharCode(74+index)+row,id='photoLink'+row+'_'+index;links+=`<hyperlink ref="${ref}" r:id="${id}"/>`;sheetRels+=`<Relationship Id="${id}" Type="${office}hyperlink" Target="${esc(trustedPhotoUrl(url))}" TargetMode="External"/>`;}
  }
  rows+=`<row r="${row}" ht="78" customHeight="1">${values.map((v,i)=>cell(i,row,v,i===0?2:0)).join('')}</row>`;
 }
 add('[Content_Types].xml',xml+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
 add('_rels/.rels',xml+`<Relationships xmlns="${relns}"><Relationship Id="workbook" Type="${office}officeDocument" Target="xl/workbook.xml"/></Relationships>`);
 add('xl/workbook.xml',xml+`<workbook xmlns="${ns}" xmlns:r="${office.slice(0,-1)}"><sheets><sheet name="${kind==='waste'?'Waste Tracking':'Facilities Tracking'}" sheetId="1" r:id="sheet"/></sheets></workbook>`);
 add('xl/_rels/workbook.xml.rels',xml+`<Relationships xmlns="${relns}"><Relationship Id="sheet" Type="${office}worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="styles" Type="${office}styles" Target="styles.xml"/></Relationships>`);
 add('xl/styles.xml',xml+`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF165844"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
 add('xl/worksheets/sheet1.xml',xml+`<worksheet xmlns="${ns}" xmlns:r="${office.slice(0,-1)}"><dimension ref="A1:L${row}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="2" width="17" customWidth="1"/><col min="3" max="3" width="36" customWidth="1"/><col min="4" max="6" width="18" customWidth="1"/><col min="7" max="7" width="25" customWidth="1"/><col min="8" max="8" width="53" customWidth="1"/><col min="9" max="9" width="34" customWidth="1"/><col min="10" max="12" width="48" customWidth="1"/></cols><sheetData>${rows}</sheetData><autoFilter ref="A1:L${row}"/><hyperlinks>${links}</hyperlinks><drawing r:id="drawing"/></worksheet>`);
 add('xl/worksheets/_rels/sheet1.xml.rels',xml+`<Relationships xmlns="${relns}">${sheetRels}<Relationship Id="drawing" Type="${office}drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
 add('xl/drawings/drawing1.xml',xml+`<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${office.slice(0,-1)}">${drawings}</xdr:wsDr>`);
 add('xl/drawings/_rels/drawing1.xml.rels',xml+`<Relationships xmlns="${relns}">${drawingRels}</Relationships>`);
 zip.end();while(queue.length)yield queue.shift()!;
 }finally{zip.terminate();}
}
