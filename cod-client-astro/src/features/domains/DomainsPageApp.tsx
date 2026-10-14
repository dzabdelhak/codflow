import { RequireAuth, useIdentity } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { DomainsManager } from "./DomainsManager";

function Gated() {
  const t = useT("domains");
  const auth = useT("auth");
  const identity = useIdentity();
  if (identity?.role !== "admin") {
    return (
      <DashboardChrome currentPath="/domains">
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{auth("no_access")}</p>
      </DashboardChrome>
    );
  }
  return (
    <DashboardChrome currentPath="/domains">
      <PageHeader title={t("page_title")} subtitle={t("page_subtitle")} />
      <DomainsManager />
    </DashboardChrome>
  );
}

export default function DomainsPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
