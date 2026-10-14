import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { ChannelOnly } from "@/features/stores/ChannelOnly";
import { MainProductManager } from "./MainProductManager";

function Gated() {
  const t = useT("products");
  return (
    <DashboardChrome currentPath="/products/main">
      <ChannelOnly type="landing">
        <PageHeader title={t("main_product.page_title")} subtitle={t("main_product.page_subtitle")} />
        <MainProductManager />
      </ChannelOnly>
    </DashboardChrome>
  );
}

export default function MainProductPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
