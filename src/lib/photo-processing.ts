import sharp from "sharp";

export async function processPhoto(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes, { limitInputPixels: 60000000, failOn: "error" });
  const meta = await image.metadata();
  if (!["jpeg", "png", "webp", "heif"].includes(meta.format || ""))
    throw new Error("Unsupported image format");
  return image.rotate()
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 }).toBuffer();
}
