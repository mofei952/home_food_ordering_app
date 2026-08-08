import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";

export type ImageUploadRead = components["schemas"]["ImageUploadRead"];

export async function uploadImage(blob: Blob): Promise<ImageUploadRead> {
  const form = new FormData();
  form.append("file", blob, "dish.webp");
  const response = await fetch("/api/images", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!response.ok) throw await ApiError.fromResponse(response);
  return response.json() as Promise<ImageUploadRead>;
}
