import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { requireUser } from "@/lib/backend";
import { canSubmit } from "@/lib/access-policy";
import { processPhoto } from "@/lib/photo-processing";
import { HttpError } from "@/lib/d1-store";
import { json, failure } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("FORBIDDEN", 403);
    const { db, profile } = await requireUser();
    if (!canSubmit(profile.role)) throw new HttpError("FORBIDDEN", 403);
    await db.limit("upload:" + profile.id, 12);
    if (!process.env.IMGBB_API_KEY)
      throw new HttpError("Image hosting is not configured.", 503);
    if (Number(req.headers.get("content-length")) > 16 * 1024 * 1024)
      throw new HttpError("Choose an image smaller than 15 MB.");
    const form = await req.formData(),
      file = form.get("image");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 15 * 1024 * 1024
    )
      throw new HttpError("Choose an image smaller than 15 MB.");
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(file.type)
    )
      throw new HttpError("Choose a JPEG, PNG, WebP, HEIC or HEIF image.");
    let buffer: Buffer;
    try {
      buffer = await processPhoto(Buffer.from(await file.arrayBuffer()));
    } catch {
      throw new HttpError(
        "This image could not be decoded safely. For unsupported HEIC images, export as JPEG and retry.",
      );
    }
    const upload = new FormData();
    upload.set("key", process.env.IMGBB_API_KEY);
    upload.set("image", buffer.toString("base64"));
    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: upload,
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json();
    if (
      !response.ok ||
      !result.success ||
      !result.data?.url?.startsWith("https://i.ibb.co/")
    )
      throw new HttpError("Image upload failed. Please retry.");
    const id = crypto.randomUUID();
    await db.write(profile, "submit", [
      db.stmt(
        "INSERT INTO photo_uploads(id,user_id,url) VALUES(?,?,?)",
        id,
        profile.id,
        result.data.url,
      ),
    ]);
    return json({ id, url: result.data.url });
  } catch (e) {
    return failure(e);
  }
}
