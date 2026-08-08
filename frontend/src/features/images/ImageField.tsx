import { ChangeEvent, useState } from "react";

import { uploadImage } from "./api";
import { compressImage } from "./compressImage";

export type ImageFieldValue = {
  imageKey: string | null;
  previewUrl: string | null;
  error?: string;
};

interface ImageFieldProps {
  value: string | null;
  previewUrl: string | null;
  onChange: (next: ImageFieldValue) => void;
  disabled?: boolean;
}

export function ImageField({
  value,
  previewUrl,
  onChange,
  disabled = false,
}: ImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string>();

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLocalError(undefined);
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const uploaded = await uploadImage(compressed.blob);
      onChange({
        imageKey: uploaded.image_key,
        previewUrl: uploaded.image_url,
        error: undefined,
      });
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message === "图片不能超过 10 MB"
          ? caught.message
          : "图片上传失败，你仍可先保存菜品";
      setLocalError(message);
      // Keep any previously saved imageKey/preview; only clearImage() removes them.
      onChange({
        imageKey: value,
        previewUrl,
        error: message,
      });
    } finally {
      setUploading(false);
    }
  }

  function clearImage() {
    setLocalError(undefined);
    onChange({ imageKey: null, previewUrl: null, error: undefined });
  }

  return (
    <fieldset>
      <legend>图片（可选）</legend>
      <label>
        菜品图片
        <input
          type="file"
          data-write="true"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => void handleFileChange(event)}
          disabled={disabled || uploading}
        />
      </label>
      {uploading && <p>正在上传图片…</p>}
      {localError && <p role="alert">{localError}</p>}
      {previewUrl && (
        <div>
          <img src={previewUrl} alt="菜品预览" width={160} height={120} />
          <button type="button" onClick={clearImage} disabled={disabled || uploading}>
            移除图片
          </button>
        </div>
      )}
      {!previewUrl && value && <p>已关联图片</p>}
    </fieldset>
  );
}
