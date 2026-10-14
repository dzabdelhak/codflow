import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { StoreProductsManager } from "./StoreProductsManager";

function Gated() {
  const t = useT("products");
  return (
    <DashboardChrome currentPath="/products/store">
      <PageHeader title={t("store_selection.page_title")} subtitle={t("store_selection.page_subtitle")} />
      <StoreProductsManager />
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
