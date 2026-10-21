import { isSameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, privileged, rateLimit, configured } from "@/lib/supabase";
import { requirePanel } from "@/lib/panels";
import { canSubmit } from "@/lib/access-policy";
import { processPhoto } from "@/lib/photo-processing";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    if (!configured()) {
      const p = await requirePanel();
      if (!canSubmit(p.role)) throw new Error("FORBIDDEN");
      throw new Error("CONFIGURATION_REQUIRED");
    }
    const { db, user, profile } = await requireUser();
    if (!canSubmit(profile.role)) throw new Error("FORBIDDEN");
    await rateLimit(db, "image-upload", 12);
    if (!process.env.IMGBB_API_KEY)
      throw new Error("Image hosting is not configured.");
    const form = await req.formData();
    const file = form.get("image");
    if (
      !(file instanceof File) ||
      file.size > 15 * 1024 * 1024 ||
      file.size === 0
    )
      throw new Error("Choose an image smaller than 15 MB.");
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(file.type)
    )
      throw new Error("Choose a JPEG, PNG, WebP, HEIC or HEIF image.");
    const bytes = Buffer.from(await file.arrayBuffer());
    let buffer: Buffer;
    try {
      buffer = await processPhoto(bytes);
    } catch {
      throw new Error(
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
      throw new Error("Image upload failed. Please retry.");
    const { data, error } = await privileged()
      .from("photo_uploads")
      .insert({ user_id: user.id, url: result.data.url })
      .select("id,url")
      .single();
    if (error) throw new Error("Could not register the upload. Please retry.");
    return NextResponse.json(data);
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(
      { error: msg },
      {
        status: msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400,
      },
    );
  }
}
