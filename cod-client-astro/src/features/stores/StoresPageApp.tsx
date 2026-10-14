import { Plus } from "lucide-react";
import { RequireAuth, useIdentity } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { LinkButton, PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { StoreManager } from "./StoreManager";

function Gated() {
  const t = useT("navigation");
  const identity = useIdentity();
  return (
    <DashboardChrome currentPath="/stores">
      <PageHeader
        title={t("stores.page_title")}
        subtitle={t("stores.page_subtitle")}
        actions={
          identity?.role === "admin" ? (
            <LinkButton href="/stores/new">
              <Plus size={16} />
              {t("stores.create")}
            </LinkButton>
          ) : undefined
        }
      />
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
