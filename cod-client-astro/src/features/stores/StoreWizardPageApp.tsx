import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { StoreWizard } from "./StoreWizard";

function Gated() {
  const t = useT("navigation");
  return (
    <DashboardChrome currentPath="/stores">
      <PageHeader title={t("stores.wizard.title")} subtitle={t("stores.wizard.subtitle")} />
      <StoreWizard />
    </DashboardChrome>
  );
}

export default function StoreWizardPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
