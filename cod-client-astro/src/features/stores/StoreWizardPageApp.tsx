import { RequireAuth, useIdentity } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { StoreWizard } from "./StoreWizard";

function Gated() {
  const t = useT("navigation");
  const auth = useT("auth");
  const identity = useIdentity();
  if (identity?.role !== "admin") {
    return (
      <DashboardChrome currentPath="/stores">
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {auth("no_access")}
        </p>
      </DashboardChrome>
    );
  }
  return (
    <DashboardChrome currentPath="/stores">
      <PageHeader title={t("stores.wizard.title")} subtitle={t("stores.wizard.subtitle")} />
      <StoreWizard userId={identity.user.id} />
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
