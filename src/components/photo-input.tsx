"use client";
import { useRef, useEffect } from "react";
import { Camera, ImagePlus, RotateCw, X, Check, Eye } from "lucide-react";
import { Button } from "./ui/button";
export type Photo = {
  key: string;
  file: File;
  preview: string;
  id?: string;
  url?: string;
  progress: number;
  error?: string;
  busy: boolean;
};
export default function PhotoInput({
  photos,
  setPhotos,
  onView,
}: {
  photos: Photo[];
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  onView: (urls: string[], index: number) => void;
}) {
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const active = useRef(new Set<XMLHttpRequest>());
  useEffect(() => {
    const requests = active.current;
    return () => requests.forEach((r) => r.abort());
  }, []);
  function patch(key: string, values: Partial<Photo>) {
    setPhotos((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...values } : p)),
    );
  }
  async function upload(photo: Photo) {
    patch(photo.key, { busy: true, error: undefined, progress: 0 });
    const xhr = new XMLHttpRequest();
    active.current.add(xhr);
    xhr.open("POST", "/api/upload");
    xhr.timeout = 90000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        patch(photo.key, { progress: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      active.current.delete(xhr);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) throw new Error(data.error);
        patch(photo.key, {
          id: data.id,
          url: data.url,
          busy: false,
          progress: 100,
        });
      } catch (e) {
        patch(photo.key, { error: (e as Error).message, busy: false });
      }
    };
    xhr.onerror = () => {
      active.current.delete(xhr);
      patch(photo.key, {
        error: "Connection lost. Retry this photo.",
        busy: false,
      });
    };
    xhr.ontimeout = () => {
      active.current.delete(xhr);
      patch(photo.key, {
        error: "Upload timed out. Please retry.",
        busy: false,
      });
    };
    try {
      const prepared = await prepareImage(photo.file);
      const body = new FormData();
      body.append("image", prepared);
      xhr.send(body);
    } catch (e) {
      active.current.delete(xhr);
      patch(photo.key, { error: (e as Error).message, busy: false });
    }
  }
  function add(files: FileList | null) {
    if (!files) return;
    const additions = Array.from(files)
      .slice(0, 3 - photos.length)
      .map((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        busy: false,
      }));
    setPhotos((p) => [...p, ...additions]);
    setTimeout(() => additions.forEach(upload), 0);
  }
  return (
    <section className="form-section">
      <div className="section-label">
        <span className="step-number">02</span>
        <div>
          <h3>Photographic evidence</h3>
          <p>1 photo required · add up to 3 · JPEG, PNG or WebP · up to 15 MB each</p>
        </div>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="photo-controls">
        <Button
          type="button"
          variant="secondary"
          disabled={photos.length >= 3}
          onClick={() => camera.current?.click()}
        >
          <Camera size={19} />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={photos.length >= 3}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={19} />
          Choose photos
        </Button>
        <span>{photos.filter((p) => p.id).length} / 3 uploaded</span>
      </div>
      <div className="photo-grid">
        {photos.map((p, i) => (
          <div className="photo-item" key={p.key}>
            <img src={p.preview} alt={`Selected site photo ${i + 1}`} />
            <button
              type="button"
              className="photo-remove"
              aria-label={`Remove photo ${i + 1}`}
              disabled={p.busy}
              onClick={() => {
                URL.revokeObjectURL(p.preview);
                setPhotos((prev) => prev.filter((v) => v.key !== p.key));
              }}
            >
              <X size={16} />
            </button>
            <button
              type="button"
              className="photo-eye"
              aria-label={`View photo ${i + 1}`}
              onClick={() =>
                onView(
                  photos.map((p) => p.preview),
                  i,
                )
              }
            >
              <Eye size={17} />
            </button>
            <div className="photo-state">
              {p.busy ? (
                <>
                  <progress max="100" value={p.progress} />
                  <small>
                    {p.progress === 100
                      ? "Processing image…"
                      : `Uploading ${p.progress}%`}
                  </small>
                </>
              ) : p.id ? (
                <span>
                  <Check size={14} />
                  Uploaded
                </span>
              ) : (
                <button type="button" onClick={() => upload(p)}>
                  <RotateCw size={14} />
                  Retry upload
                </button>
              )}
            </div>
            {p.error && <small className="error-text">{p.error}</small>}
          </div>
        ))}
      </div>
    </section>
  );
}

async function prepareImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size > 3500000)
      throw new Error(
        "Export this image as a smaller JPEG (under 3.5 MB), then retry.",
      );
    return file;
  }
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing unavailable.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not prepare image."))),
        "image/jpeg",
        0.82,
      ),
    );
    if (blob.size > 3500000)
      throw new Error("Choose a smaller image (under 3.5 MB after resizing).");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}
