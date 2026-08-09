import { afterEach, describe, expect, it, vi } from "vitest";

import { compressImage } from "./compressImage";

const VALID_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

type BitmapSize = { width: number; height: number };

function mockImageBitmap(size: BitmapSize) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: size.width,
      height: size.height,
      close: vi.fn(),
    })),
  );

  const toBlob = vi.fn(
    (callback: BlobCallback, _type?: string, _quality?: number) => {
      callback(new Blob([new Uint8Array(1024)], { type: "image/webp" }));
    },
  );

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
    })),
    toBlob,
  };

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return canvas as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tag);
  });

  return { canvas, toBlob };
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

  it("limits the longest edge to 1600 pixels", async () => {
    mockImageBitmap({ width: 3200, height: 2400 });
    const result = await compressImage(
      new File([VALID_JPEG], "dish.jpg", { type: "image/jpeg" }),
    );
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
  });
});
