import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { StoreManager } from "./StoreManager";

function Gated() {
  const t = useT("navigation");
  return (
    <DashboardChrome currentPath="/stores">
      <PageHeader title={t("stores.page_title")} subtitle={t("stores.page_subtitle")} />
      <StoreManager />
    </DashboardChrome>
  );
}

export default function StoresPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
