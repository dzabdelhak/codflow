import { beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(message: string, public status: number, public code?: string) {
      super(message);
    }
  }
  return { apiFetch: vi.fn(), ApiError };
});
vi.mock("@/lib/api", () => seam);

import {
  ACCEPTED_IMAGE_TYPES,
  ImageUploadFailedError,
  ImageUploadRejectedError,
  MAX_UPLOAD_MB,
  partitionUploadFiles,
  uploadFailureKey,
  uploadImageFile,
  validateUploadFile,
} from "./api";

function makeFile(input: { type?: string; size?: number } = {}): File {
  const { type = "image/jpeg", size = 100 } = input;
  return new File([new Uint8Array(size)], "img.jpg", { type });
}

const UPLOADED = { key: "products/abc.webp", url: "https://api.example/images/products/abc.webp", width: 800, height: 600 };

beforeEach(() => {
  vi.clearAllMocks();
  seam.apiFetch.mockResolvedValue({ success: true, data: UPLOADED });
});

describe("uploadImageFile", () => {
  it("posts the file and its folder as multipart to the API and returns the stored image", async () => {
    const file = makeFile();
    await expect(uploadImageFile(file, "landing")).resolves.toEqual(UPLOADED);
    const [path, init] = seam.apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/images/upload");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("file")).toBe(file);
    expect(form.get("folder")).toBe("landing");
  });

  it("does not call the API for a file the browser can already refuse", async () => {
    await expect(uploadImageFile(makeFile({ type: "application/pdf" }), "products")).rejects.toMatchObject({ reason: "unsupported_type" });
    await expect(uploadImageFile(makeFile({ size: MAX_UPLOAD_MB * 1024 * 1024 + 1 }), "products")).rejects.toMatchObject({
      reason: "file_too_large",
    });
    expect(seam.apiFetch).not.toHaveBeenCalled();
  });

  it("turns the server's refusals into the same rejections, and anything else into a failure", async () => {
    seam.apiFetch.mockRejectedValueOnce(new seam.ApiError("not an image", 400, "INVALID_FILE_TYPE"));
    await expect(uploadImageFile(makeFile(), "products")).rejects.toBeInstanceOf(ImageUploadRejectedError);
    seam.apiFetch.mockRejectedValueOnce(new seam.ApiError("too large", 413, "FILE_TOO_LARGE"));
    await expect(uploadImageFile(makeFile(), "products")).rejects.toMatchObject({ reason: "file_too_large" });
    seam.apiFetch.mockRejectedValueOnce(new seam.ApiError("boom", 500, "INTERNAL_SERVER_ERROR"));
    await expect(uploadImageFile(makeFile(), "products")).rejects.toEqual(new ImageUploadFailedError(500));
  });
});

describe("file selection", () => {
  it("accepts the same image types as the server", () => {
    expect(ACCEPTED_IMAGE_TYPES).toEqual(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
    expect(() => validateUploadFile(makeFile({ type: "image/png" }))).not.toThrow();
  });

  it("partitions a selection into accepted, unsupported and oversized files", () => {
    const big = makeFile({ size: MAX_UPLOAD_MB * 1024 * 1024 + 1 });
    const result = partitionUploadFiles([makeFile(), makeFile({ type: "text/plain" }), big]);
    expect(result).toMatchObject({ unsupportedCount: 1, tooLargeCount: 1 });
    expect(result.accepted).toHaveLength(1);
  });
});

describe("uploadFailureKey", () => {
  it("names why an upload was refused, or that it failed", () => {
    expect(uploadFailureKey(new ImageUploadRejectedError("unsupported_type"))).toBe("feedback.unsupported_file");
    expect(uploadFailureKey(new ImageUploadRejectedError("file_too_large"))).toBe("feedback.file_too_large");
    expect(uploadFailureKey(new ImageUploadFailedError(500))).toBe("feedback.upload_failed");
  });
});
