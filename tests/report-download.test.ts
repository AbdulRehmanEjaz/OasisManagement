import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {downloadReportArchive} from '../src/lib/report-download';
for(const kind of ['waste','inspection'] as const)for(const format of ['zip','xlsx'] as const)test(`${kind} ${format}: all 110 original photos survive paginated individual requests`,async()=>{
 const original=Uint8Array.from([255,216,255,217]),prefix=kind==='waste'?'COSA':'OFT';
 const photos=Array.from({length:110},(_,i)=>({id:String(i),number:`${prefix}-${String(i+102).padStart(3,'0')}`,url:`https://i.ibb.co/test/${i}.jpg`}));
 const requests:string[]=[];let finalProgress=0;
 const request=(async(input,options)=>{const url=new URL(String(input),'https://example.test');requests.push(url.pathname+url.search);if(url.hostname==='i.ibb.co'){assert.equal(options?.credentials,'omit');assert.equal(options?.redirect,'error');return new Response(original,{headers:{'Content-Type':'image/jpeg'}});}assert.equal(options?.credentials,'same-origin');assert.equal(url.searchParams.get('kind'),kind);
 if(url.searchParams.has('manifest')){const offset=Number(url.searchParams.get('cursor')||0),selected=photos.slice(offset,offset+50);return Response.json({...format==='zip'?{photos:selected}:{reports:selected.map(p=>({number:p.number,created_at:'2026-10-24T12:00:00Z',latitude:26.5,longitude:37.9,quantity:12,photos:[p]}))},nextCursor:offset+50<photos.length?String(offset+50):null});}
 assert.ok(url.searchParams.has('photo'));return new Response(original,{headers:{'Content-Type':'image/jpeg'}});
 }) as typeof fetch;
 const blob=await downloadReportArchive(kind,format,(done,total)=>{assert.equal(total,110);finalProgress=done;},request),entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));
 const images=Object.entries(entries).filter(([name])=>name.endsWith('.jpg'));assert.equal(images.length,110);for(const [,bytes]of images)assert.deepEqual(bytes,original);
 assert.equal(finalProgress,110);assert.equal(requests.filter(u=>u.includes('manifest=1')).length,3);assert.equal(requests.filter(u=>u.endsWith('.jpg')).length,110);assert.ok(!requests.some(u=>u.includes('download=1')));
 if(format==='zip')assert.ok(entries[`${prefix}-102/${prefix}-102-01.jpg`]);else assert.match(strFromU8(entries['xl/worksheets/sheet1.xml']),new RegExp(prefix+'-102'));
});
test('Transient and interrupted photo requests retry without inserting corrupt or duplicate images',async()=>{
 let attempts=0;const original=Uint8Array.from([255,216,255,217]);
 const request=(async(input)=>{if(String(input).includes('manifest=1'))return Response.json({photos:[{id:'one',number:'COSA-102',url:'https://i.ibb.co/test/one.jpg'}]});attempts++;if(attempts===1)return Response.json({error:'Temporary host failure'},{status:502});if(attempts<=3)return new Response(new ReadableStream({start(c){c.error(new Error('Interrupted image stream'));}}));return new Response(original,{headers:{'Content-Type':'image/jpeg'}});}) as typeof fetch;
 const blob=await downloadReportArchive('waste','zip',()=>{},request),entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));assert.equal(attempts,4);assert.deepEqual(entries['COSA-102/COSA-102-01.jpg'],original);assert.equal(Object.keys(entries).length,1);
});
test('Permanent image failure never produces a misleading partial archive',async()=>{
 const request=(async(input)=>String(input).includes('manifest=1')?Response.json({photos:[{id:'one',number:'COSA-102',url:'https://i.ibb.co/test/one.jpg'}]}):Response.json({error:'Original photo unavailable'},{status:502})) as typeof fetch;
 await assert.rejects(downloadReportArchive('waste','zip',()=>{},request),/could not provide any photos/);
});

for(const format of ['zip','xlsx'] as const)test(format+' clearly identifies host failures while preserving available original photos',async()=>{
 const photos=[{id:'one',number:'COSA-102',url:'https://i.ibb.co/test/one.jpg'},{id:'two',number:'COSA-103',url:'https://i.ibb.co/test/two.jpg'}];let missing=0;
 const request=(async(input)=>{const url=String(input);if(url.includes('manifest=1'))return Response.json(format==='zip'?{photos}:{reports:photos.map(p=>({number:p.number,created_at:'2026-10-24T12:00:00Z',latitude:26.5,longitude:37.9,photos:[p]}))});if(url.includes('two'))return Response.json({error:'Image host unavailable'},{status:503});return new Response(Uint8Array.from([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});}) as typeof fetch;
 const blob=await downloadReportArchive('waste',format,(_done,_total,count)=>{missing=count||0;},request),files=unzipSync(new Uint8Array(await blob.arrayBuffer()));assert.equal(missing,1);assert.equal(Object.keys(files).filter(n=>n.endsWith('.jpg')).length,1);assert.match(strFromU8(files[format==='zip'?'_UNAVAILABLE_PHOTOS.txt':'xl/worksheets/sheet1.xml']),format==='zip'?/COSA-103/:/original photos unavailable/);
});
