import { afterEach, describe, expect, it, vi } from "vitest";

import { compressImage } from "./compressImage";

const VALID_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

type BitmapSize = { width: number; height: number };

function mockImageBitmap(
  size: BitmapSize,
  options?: {
    blobFactory?: (
      quality: number | undefined,
      callIndex: number,
    ) => Blob | null;
    context?: unknown;
  },
) {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: size.width,
      height: size.height,
      close,
    })),
  );

  let callIndex = 0;
  const toBlob = vi.fn(
    (callback: BlobCallback, _type?: string, quality?: number) => {
      const blob =
        options?.blobFactory?.(quality, callIndex++) ??
        new Blob([new Uint8Array(1024)], { type: "image/webp" });
      callback(blob);
    },
  );

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() =>
      options && "context" in options
        ? options.context
        : {
            drawImage: vi.fn(),
          },
    ),
    toBlob,
  };

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return canvas as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tag);
  });

  return { canvas, toBlob, close };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("compressImage", () => {
  it("rejects a source file over 10 MB", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", {
      type: "image/jpeg",
    });
    await expect(compressImage(file)).rejects.toThrow("图片不能超过 10 MB");
  });

  it("accepts a source file exactly 10 MB", async () => {
    mockImageBitmap({ width: 800, height: 600 });
    const file = new File([new Uint8Array(10 * 1024 * 1024)], "edge.jpg", {
      type: "image/jpeg",
    });
    await expect(compressImage(file)).resolves.toMatchObject({
      width: 800,
      height: 600,
    });
  });

  it("limits the longest edge to 1600 pixels", async () => {
    mockImageBitmap({ width: 3200, height: 2400 });
    const result = await compressImage(
      new File([VALID_JPEG], "dish.jpg", { type: "image/jpeg" }),
    );
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
  });

  it("does not upscale images already within the edge limit", async () => {
    mockImageBitmap({ width: 800, height: 600 });
    const result = await compressImage(
      new File([VALID_JPEG], "small.jpg", { type: "image/jpeg" }),
    );
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("scales portrait images by the longest edge", async () => {
    mockImageBitmap({ width: 1200, height: 3200 });
    const result = await compressImage(
      new File([VALID_JPEG], "portrait.jpg", { type: "image/jpeg" }),
    );
    expect(result.width).toBe(600);
    expect(result.height).toBe(1600);
  });

  it("retries quality then rejects when still over 2 MB", async () => {
    const oversized = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {
      type: "image/webp",
    });
    const { toBlob, close } = mockImageBitmap(
      { width: 1600, height: 1200 },
      { blobFactory: () => oversized },
    );

    await expect(
      compressImage(new File([VALID_JPEG], "heavy.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow("图片压缩后仍超过 2 MB");

    expect(toBlob.mock.calls.length).toBeGreaterThan(1);
    expect(close).toHaveBeenCalled();
  });

  it("rejects when canvas context is unavailable and still closes bitmap", async () => {
    const { close } = mockImageBitmap(
      { width: 100, height: 100 },
      { context: null },
    );
    await expect(
      compressImage(new File([VALID_JPEG], "x.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow("无法压缩图片");
    expect(close).toHaveBeenCalled();
  });
});
