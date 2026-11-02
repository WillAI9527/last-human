export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1568;

const EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

export type UploadMime = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
export type UploadErrorCode = "type" | "size";

export function sniffMime(file: File): UploadMime | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (type === "image/png" || type === "image/jpeg" || type === "image/webp" || type === "application/pdf") {
    return type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mapped = EXT[ext];
  return mapped === "image/png" || mapped === "image/jpeg" || mapped === "image/webp" || mapped === "application/pdf"
    ? mapped
    : null;
}

export function validateUpload(file: File): UploadErrorCode | null {
  if (!sniffMime(file)) return "type";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return null;
}

export async function compressImage(file: File, maxEdge = MAX_IMAGE_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("compress");
    return blob;
  } finally {
    bitmap.close();
  }
}
