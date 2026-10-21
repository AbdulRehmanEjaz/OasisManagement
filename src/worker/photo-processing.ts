import type { ImagesBinding } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";

export async function processPhoto(bytes: Buffer): Promise<Buffer> {
  const images = (env as unknown as { IMAGES: ImagesBinding }).IMAGES;
  if (!images) throw new Error("Cloudflare Images binding is not configured.");
  // Each operation consumes its stream, so metadata and conversion need their own.
  const stream = () => new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); },
  }) as unknown as Parameters<ImagesBinding["input"]>[0];
  const info = await images.info(stream());
  if (!('width' in info) || !('height' in info) ||
      !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(info.format) ||
      info.width <= 0 || info.height <= 0 || info.width * info.height > 60000000)
    throw new Error("Unsupported image format or dimensions");
  // Images auto-orients using EXIF and strips metadata when re-encoding.
  const output = await images.input(stream())
    .transform({ width: 2000, height: 2000, fit: "scale-down" })
    .output({ format: "image/jpeg", quality: 82 });
  return Buffer.from(await output.response().arrayBuffer());
}
