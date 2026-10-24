import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { photoZip, trustedPhotoUrl, type ExportPhoto } from "../src/lib/photo-zip";
async function* photos(rows: ExportPhoto[]) { yield* rows; }
async function collect(stream: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
test("Photo ZIP preserves original bytes and names each photo by report", async () => {
  const first = new Uint8Array([255,216,255,4,0,1,9]);
  const second = new Uint8Array([137,80,78,71,0,2,9]);
  let requests = 0;
  const fetchPhoto = (async (_url,options) => {assert.equal(options?.redirect,"manual");return new Response(requests++ === 0 ? first : second, {headers:{"Content-Type":requests === 1 ? "image/jpeg" : "image/png"}});}) as typeof fetch;
  const zip = await collect(photoZip(photos([{number:"OFT-001",url:"https://i.ibb.co/a/one.jpg"},{number:"OFT-001",url:"https://i.ibb.co/b/two.png"}]),new AbortController().signal,fetchPhoto));
  const extracted = unzipSync(zip);
  assert.deepEqual(Object.keys(extracted),["OFT-001/OFT-001-01.jpg","OFT-001/OFT-001-02.png"]);
  assert.deepEqual(extracted[Object.keys(extracted)[0]],first);
  assert.deepEqual(extracted[Object.keys(extracted)[1]],second);
  assert.equal(zip.readUInt16LE(8),0,"ZIP uses STORE without recompression");
});
test("Photo exports reject untrusted hosts and failed image responses", async () => {
  for(const url of ["http://i.ibb.co/a.jpg","https://example.com/a.jpg","https://i.ibb.co.evil.test/a.jpg","https://name:secret@i.ibb.co/a.jpg"])
    assert.throws(()=>trustedPhotoUrl(url));
  await assert.rejects(collect(photoZip(photos([{number:"COSA-001",url:"https://i.ibb.co/a.jpg"}]),new AbortController().signal,(async()=>new Response("missing",{status:404})) as typeof fetch)),/Could not download/);
});
test("Cancelled exports stop before downloading images", async () => {
  const abort = new AbortController();abort.abort();
  await assert.rejects(collect(photoZip(photos([{number:"COSA-001",url:"https://i.ibb.co/a.jpg"}]),abort.signal,(async()=>{throw new Error("must not fetch");}) as typeof fetch)),/cancelled/);
});
