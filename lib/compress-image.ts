/**
 * Browser-only: shrinks a phone photo to a ~1600px JPEG (~300 KB) before upload (spec §4).
 * EXIF rotation is applied, so the uploaded image is upright and carries no metadata.
 */
export type CompressedImage = { blob: Blob; width: number; height: number };

const MAX_SIDE = 1600;

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process photos.");
    ctx.fillStyle = "#fff"; // PNG transparency → white, not black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Step quality down until the file is a sensible size.
    for (const quality of [0.75, 0.6, 0.45]) {
      const blob = await toJpeg(canvas, quality);
      if (blob.size <= 450_000 || quality === 0.45) return { blob, width, height };
    }
    throw new Error("unreachable");
  } finally {
    bitmap.close();
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't compress the photo."))), "image/jpeg", quality),
  );
}
