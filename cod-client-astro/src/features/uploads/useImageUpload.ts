import { useCallback, useState } from "react";
import {
  ImageUploadFailedError,
  ImageUploadRejectedError,
  uploadImageFile,
} from "./api";
import type { ImageUploadFolder, ImageUploadRejection, UploadedImage } from "./api";

/** null = idle; 0–100 while an upload is in flight. fetch cannot report
 *  upload bytes, so only the start is reported and the value returns to null
 *  when the upload settles. */
type UploadProgress = number | null;

interface ImageUploadError {
  reason: ImageUploadRejection | "failed";
  status?: number;
}

export function useImageUpload(folder: ImageUploadFolder) {
  const [progress, setProgress] = useState<UploadProgress>(null);
  const [error, setError] = useState<ImageUploadError | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadedImage> => {
      setProgress(0);
      setError(null);
      try {
        return await uploadImageFile(file, folder);
      } catch (cause) {
        setError(
          cause instanceof ImageUploadRejectedError
            ? { reason: cause.reason }
            : cause instanceof ImageUploadFailedError
              ? { reason: "failed", status: cause.status }
              : { reason: "failed" },
        );
        throw cause;
      } finally {
        setProgress(null);
      }
    },
    [folder],
  );

  const reset = useCallback(() => {
    setProgress(null);
    setError(null);
  }, []);

  return { upload, progress, error, reset };
}
