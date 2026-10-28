import { Zip, ZipPassThrough, strToU8 } from "fflate";

export type ExportPhoto = { number: string; url: string };
export function trustedPhotoUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "i.ibb.co" || url.username || url.password || url.port) throw new Error("Invalid photo hosting URL.");
  return url.href;
}
export async function* photoZip(photos: AsyncIterable<ExportPhoto>, signal: AbortSignal, fetchPhoto: typeof fetch = fetch, onPhotoError?: (photo:ExportPhoto,error:Error)=>void): AsyncGenerator<Uint8Array> {
  const pending: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => { if (error) throw error; pending.push(chunk); });
  const numbers = new Map<string, number>();
  let size = 0, count = 0, saved = 0; const missing:string[]=[];
  try {
    for await (const photo of photos) {
      if (signal.aborted) throw new Error("Download cancelled.");
      if (++count > 65535) throw new Error("This archive exceeds the ZIP file count limit.");
      // Workers supports manual/follow only; reject redirects through the status check.
      let response:Response,extension:string|undefined;
      try {
      response = await fetchPhoto(trustedPhotoUrl(photo.url), { redirect: "manual", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
      if (!response.ok || !response.body) throw new Error(`Could not download a photo for ${photo.number}. Please retry.`);
      const mime = response.headers.get("content-type")?.split(";")[0].toLowerCase();
      extension = ({"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif"} as Record<string,string>)[mime || ""];
      if (!extension) throw new Error("The image host returned an unsupported photo response.");
      }catch(e){if(!onPhotoError||signal.aborted)throw e;const error=e as Error;missing.push(photo.number+': '+error.message);onPhotoError(photo,error);continue;}
      saved++;
      const report = photo.number.replace(/[^a-zA-Z0-9_-]/g, "_");
      const index = (numbers.get(report) || 0) + 1;
      numbers.set(report, index);
      const file = new ZipPassThrough(`${report}/${report}-${String(index).padStart(2,"0")}.${extension}`);
      zip.add(file);
      const reader = response.body.getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 0xffffffff - 16 * 1024 * 1024) throw new Error("This archive exceeds the 4 GB ZIP limit.");
          file.push(part.value);
          while (pending.length) yield pending.shift()!;
        }
        file.push(new Uint8Array(), true);
        while (pending.length) yield pending.shift()!;
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    if(missing.length){if(!saved)throw new Error('The image host could not provide any photos. Please retry later.');const file=new ZipPassThrough('_UNAVAILABLE_PHOTOS.txt');zip.add(file);file.push(strToU8('Unavailable original photos (not included in this archive). Retry later to retrieve these images.\n\n'+missing.join('\n')),true);while(pending.length)yield pending.shift()!;}
    zip.end();
    while (pending.length) yield pending.shift()!;
  } finally { zip.terminate(); }
}
