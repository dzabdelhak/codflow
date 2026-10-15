import { Alert, LinkButton } from "@/components/ui";
import { useT } from "@/i18n/react";
import { useAventyCatalogue } from "@/features/stores/useMerchantStores";

export function AventyCatalogueNotice({ withStoreLink = false }: { withStoreLink?: boolean }) {
  const t = useT("products");
  if (!useAventyCatalogue()) return null;
  return (
    <Alert tone="info">
      <span className="flex-1">
        <span className="font-semibold">{t("aventy.title")}</span> {t("aventy.body")}
      </span>
      {withStoreLink && (
        <LinkButton href="/products/store" variant="secondary" size="sm">
          {t("aventy.store_link")}
        </LinkButton>
      )}
    </Alert>
  );
}
