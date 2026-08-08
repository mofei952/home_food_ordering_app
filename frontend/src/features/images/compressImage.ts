export type CompressedImage = {
  blob: Blob;
  width: number;
  height: number;
};

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 1600;
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.4;
const QUALITY_STEP = 0.08;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("图片不能超过 10 MB");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("无法压缩图片");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    let quality = INITIAL_QUALITY;
    let blob: Blob | null = null;
    while (quality >= MIN_QUALITY - 1e-9) {
      blob = await canvasToBlob(canvas, "image/webp", quality);
      if (blob && blob.size <= MAX_OUTPUT_BYTES) {
        break;
      }
      quality -= QUALITY_STEP;
    }

    if (!blob) {
      throw new Error("无法压缩图片");
    }
    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new Error("图片压缩后仍超过 2 MB");
    }

    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
