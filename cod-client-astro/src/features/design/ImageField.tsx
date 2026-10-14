import { useRef } from "react";
import { ImageUp } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import { ACCEPTED_IMAGE_TYPES, ImageUploadRejectedError } from "@/features/uploads/api";
import { useImageUpload } from "@/features/uploads/useImageUpload";

export function ImageField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (url: string) => void }) {
  const t = useT("design");
  const common = useT("common");
  const picker = useRef<HTMLInputElement>(null);
  const { upload, progress } = useImageUpload("branding");

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange((await upload(file)).url);
    } catch (cause) {
      notify.error(
        cause instanceof ImageUploadRejectedError
          ? common(cause.reason === "unsupported_type" ? "feedback.unsupported_file" : "feedback.file_too_large")
          : t("upload_failed"),
      );
    } finally {
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      {value && <img src={value} alt="" className="size-9 shrink-0 rounded border border-border object-cover" />}
      <Input dir="ltr" value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} />
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => void pick(event.currentTarget.files?.[0])}
      />
      <Button type="button" variant="secondary" size="sm" onClick={() => picker.current?.click()} disabled={progress !== null} aria-busy={progress !== null}>
        <ImageUp size={14} aria-hidden="true" />
        {progress !== null ? t("uploading") : t("upload")}
      </Button>
    </div>
  );
}
