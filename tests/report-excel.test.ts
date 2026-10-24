import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync,strFromU8 } from 'fflate';
import { reportExcel } from '../src/lib/report-excel';
for(const kind of ['waste','inspection'] as const)test(`${kind} Excel columns, photos and links`,async()=>{
 const image=Uint8Array.from([255,216,255,217]);
 async function* reports(){yield {number:kind==='waste'?'COSA-001':'OFT-001',created_at:'2026-10-22T12:00:00Z',site:'=1+1 & <site>',category:'Mixed domestic wastes',quantity:12.5,latitude:26.5,longitude:37.9,photos:[{url:'https://i.ibb.co/test/image.jpg'},{url:'https://i.ibb.co/test/image2.jpg'}]};}
 const chunks=[];for await(const c of reportExcel(kind,reports(),new AbortController().signal,(async(_url,options)=>{assert.equal(options?.redirect,"manual");return new Response(image,{headers:{'content-type':'image/jpeg'}});}) as typeof fetch))chunks.push(c);
 const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const zip=unzipSync(bytes),sheet=strFromU8(zip['xl/worksheets/sheet1.xml']);
 const expected=kind==='waste'?['Date','Report Code','Waste type','Weight(kg)','Latitude','Longitude','Location G-maps link','Site Photo']:['Date','Report Code','Site Name','Longitude','Latitude','Type of Structure','G-Map Link','Site Photo'];
 let previous=-1;for(const header of expected){const position=sheet.indexOf('>'+header+'<');assert.ok(position>previous,header);previous=position;}
 assert.deepEqual(zip['xl/media/image1.jpg'],image);assert.deepEqual(zip['xl/media/image2.jpg'],image);
 assert.match(strFromU8(zip['xl/worksheets/_rels/sheet1.xml.rels']),/query=26.5,37.9/);
 assert.match(sheet,kind==='waste'?/<c r="E2" s="0"><v>26.5/:/<c r="D2" s="0"><v>37.9/);
 if(kind==='inspection'){assert.match(sheet,/<c r="F2" s="0" t="inlineStr"><is><t xml:space="preserve"><\/t>/);assert.ok(!sheet.includes('<f>'));}
});
