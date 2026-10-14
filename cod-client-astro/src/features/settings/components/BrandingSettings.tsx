import { Palette } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { useT } from "@/i18n/react";

export function BrandingSettings() {
  const t = useT("settings");
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4 p-5">
        <Palette size={20} className="text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("store.branding_title")}</p>
          <p className="text-sm text-muted-foreground">{t("store.branding_moved")}</p>
        </div>
        <LinkButton href="/design">{t("store.branding_open_editor")}</LinkButton>
      </div>
    </Card>
  );
}
