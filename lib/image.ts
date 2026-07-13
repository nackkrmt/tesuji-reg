// Downscale an uploaded image to a JPEG data URL so it fits comfortably in
// localStorage (Milestone 1). In Milestone 2 this is replaced by an upload to
// Supabase Storage that returns a real URL.

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
    img.src = src;
  });
}

export async function fileToDownscaledDataUrl(
  file: File,
  maxDim = 1280,
  quality = 0.82,
): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    let { width, height } = img;
    const longest = Math.max(width, height);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // e.g. HEIC that the browser can't decode — keep the original bytes.
    return original;
  }
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB raw cap before downscale

/** Hard cap AFTER downscale — must stay ≤ the 5 MB tesuji-slips bucket limit.
 *  Reachable when the browser can't decode the image (e.g. HEIC) and
 *  fileToDownscaledDataUrl falls through with the original bytes. */
export const MAX_SLIP_BYTES = 5 * 1024 * 1024;

/** Approximate decoded byte size of a data: URL (base64 → ×3/4, minus padding). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(dataUrl.slice(0, comma))) return body.length;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}
