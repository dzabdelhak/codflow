import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { ChannelOnly } from "@/features/stores/ChannelOnly";
import { StoreProductsManager } from "./StoreProductsManager";

function Gated() {
  const t = useT("products");
  return (
    <DashboardChrome currentPath="/products/store">
      <ChannelOnly type="store">
        <PageHeader title={t("store_selection.page_title")} subtitle={t("store_selection.page_subtitle")} />
        <StoreProductsManager />
      </ChannelOnly>
    </DashboardChrome>
  );
}

export default function StoreProductsPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
