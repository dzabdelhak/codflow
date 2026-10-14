import { useState } from "react";
import { Store } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { useT } from "@/i18n/react";
import type { StoreConfig, StoreLang } from "@/features/settings/types";
import { FieldRow, SettingsSection } from "@/features/settings/components/SettingsSection";

export function GeneralSettings({
  storeConfig,
  onSave,
}: {
  storeConfig: StoreConfig;
  onSave: (payload: { name?: string; lang?: StoreLang }) => Promise<void>;
}) {
  const t = useT("settings");
  const [name, setName] = useState(storeConfig.name);
  const [lang, setLang] = useState<StoreLang>(storeConfig.lang);

  return (
    <SettingsSection
      icon={Store}
      title={t("store.general_title")}
      subtitle={t("store.general_subtitle")}
      onSave={async () => {
        await onSave({
          name: name.trim() || storeConfig.name,
          lang,
        });
      }}
    >
      <FieldRow label={t("store.name_label")}>
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder={t("store.name_placeholder")}
        />
      </FieldRow>
      <FieldRow label={t("store.domain_label")} hint={t("store.domain_moved")}>
        <a href="/domains" className="text-sm font-semibold text-brand underline">
          {t("store.domain_open")}
        </a>
      </FieldRow>
      <FieldRow label={t("store.lang_label")}>
        <Select
          value={lang}
          onChange={(event) => setLang(event.currentTarget.value as StoreLang)}
        >
          <option value="ar">{t("store.lang_ar")}</option>
          <option value="en">{t("store.lang_en")}</option>
          <option value="fr">{t("store.lang_fr")}</option>
        </Select>
      </FieldRow>
    </SettingsSection>
  );
}
