import { ApiError, apiFetch } from "@/lib/api";

export type ImageUploadFolder = "products" | "landing" | "branding";

export interface UploadedImage {
  key: string;
  url: string;
  width: number | null;
  height: number | null;
}

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
export const MAX_UPLOAD_MB = 10;

export type ImageUploadRejection = "unsupported_type" | "file_too_large";

export class ImageUploadRejectedError extends Error {
  constructor(public readonly reason: ImageUploadRejection) {
    super(reason === "unsupported_type" ? "Unsupported file type" : `File exceeds ${MAX_UPLOAD_MB} MB`);
    this.name = "ImageUploadRejectedError";
  }
}

export class ImageUploadFailedError extends Error {
  constructor(public readonly status: number) {
    super(`Image upload failed: ${status}`);
    this.name = "ImageUploadFailedError";
  }
}

interface DataEnvelope<T> {
  success: boolean;
  data: T;
}

/** Same selection semantics the three uploaders had: unsupported types are
 *  counted over ALL selected files, oversized only over the type-accepted
 *  ones; `accepted` passes both filters. */
export function partitionUploadFiles(files: File[]): {
  accepted: File[];
  unsupportedCount: number;
  tooLargeCount: number;
} {
  const unsupportedCount = files.filter((file) => !ACCEPTED_IMAGE_TYPES.includes(file.type)).length;
  const typeAccepted = files.filter((file) => ACCEPTED_IMAGE_TYPES.includes(file.type));
  const tooLargeCount = typeAccepted.filter((file) => file.size > MAX_UPLOAD_MB * 1024 * 1024).length;
  return {
    accepted: typeAccepted.filter((file) => file.size <= MAX_UPLOAD_MB * 1024 * 1024),
    unsupportedCount,
    tooLargeCount,
  };
}

/** Throws ImageUploadRejectedError for a file that must not be uploaded. */
export function validateUploadFile(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new ImageUploadRejectedError("unsupported_type");
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new ImageUploadRejectedError("file_too_large");
}

/** The one upload call: the server checks the bytes, stores a WebP and measures it. */
export async function uploadImageFile(file: File, folder: ImageUploadFolder): Promise<UploadedImage> {
  validateUploadFile(file);
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  try {
    return (await apiFetch<DataEnvelope<UploadedImage>>("/api/images/upload", { method: "POST", body: form })).data;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === "INVALID_FILE_TYPE") throw new ImageUploadRejectedError("unsupported_type");
    if (cause instanceof ApiError && cause.code === "FILE_TOO_LARGE") throw new ImageUploadRejectedError("file_too_large");
    throw new ImageUploadFailedError(cause instanceof ApiError ? cause.status : 0);
  }
}

export type UploadFailureKey = "feedback.unsupported_file" | "feedback.file_too_large" | "feedback.upload_failed";

/** The common-namespace message for a failed upload: why it was refused, or that it failed. */
export function uploadFailureKey(cause: unknown): UploadFailureKey {
  if (cause instanceof ImageUploadRejectedError) {
    return cause.reason === "unsupported_type" ? "feedback.unsupported_file" : "feedback.file_too_large";
  }
  return "feedback.upload_failed";
}
