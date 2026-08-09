import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageField } from "./ImageField";

vi.mock("./compressImage", () => ({
  compressImage: vi.fn(async (file: File) => ({
    blob: new Blob([new Uint8Array(8)], { type: "image/webp" }),
    width: 100,
    height: 80,
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImageField", () => {
  it("uploads compressed image and reports imageKey", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          image_key: "hh/abc.webp",
          image_url: "https://example.test/hh/abc.webp",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ImageField value={null} previewUrl={null} onChange={onChange} />);
    const input = screen.getByLabelText("菜品图片");
    const file = new File([new Uint8Array(4)], "dish.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        imageKey: "hh/abc.webp",
        previewUrl: "https://example.test/hh/abc.webp",
        error: undefined,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/images",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("reports upload failure without clearing text form responsibility", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: "图片上传失败",
            code: "image_upload_failed",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<ImageField value={null} previewUrl={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("菜品图片"), {
      target: {
        files: [
          new File([new Uint8Array(4)], "dish.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        imageKey: null,
        previewUrl: null,
        error: "图片上传失败，你仍可先保存菜品",
      }),
    );
  });

  it("keeps previous imageKey when replacement upload fails", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: "图片上传失败",
            code: "image_upload_failed",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(
      <ImageField
        value="hh/existing.webp"
        previewUrl="https://example.test/hh/existing.webp"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("菜品图片"), {
      target: {
        files: [
          new File([new Uint8Array(4)], "dish.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        imageKey: "hh/existing.webp",
        previewUrl: "https://example.test/hh/existing.webp",
        error: "图片上传失败，你仍可先保存菜品",
      }),
    );
  });
});
