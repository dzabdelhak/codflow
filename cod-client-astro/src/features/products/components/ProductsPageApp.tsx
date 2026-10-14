import { Plus } from "lucide-react";
import {
  canScope,
  RequireAuth,
  useIdentity,
} from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { LinkButton, PageHeader } from "@/components/ui";
import { useT } from "@/i18n/react";
import { ChannelOnly } from "@/features/stores/ChannelOnly";
import { SCOPES } from "../../../../../cod-shared/rbac/scopes";
import { ProductsList } from "@/features/products/components/ProductsList";

function Gated() {
  const t = useT("products");
  const identity = useIdentity();
  return (
    <DashboardChrome currentPath="/products">
      <ChannelOnly type="store">
        <PageHeader
          title={t("page_title")}
          actions={
            canScope(identity, SCOPES.PRODUCTS_CREATE) ? (
              <LinkButton href="/products/new">
                <Plus size={16} />
                {t("add_product")}
              </LinkButton>
            ) : undefined
          }
        />
        <ProductsList />
      </ChannelOnly>
    </DashboardChrome>
  );
}

export default function ProductsPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
