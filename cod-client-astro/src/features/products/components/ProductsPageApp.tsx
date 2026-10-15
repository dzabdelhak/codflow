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
import { AventyCatalogueNotice } from "@/features/products/components/AventyCatalogueNotice";
import { useAventyCatalogue } from "@/features/stores/useMerchantStores";

function Gated() {
  const t = useT("products");
  const identity = useIdentity();
  const aventy = useAventyCatalogue();
  return (
    <DashboardChrome currentPath="/products">
      <ChannelOnly type="store">
        <PageHeader
          title={t("page_title")}
          actions={
            canScope(identity, SCOPES.PRODUCTS_CREATE) && !aventy ? (
              <LinkButton href="/products/new">
                <Plus size={16} />
                {t("add_product")}
              </LinkButton>
            ) : undefined
          }
        />
        <div className="mb-3">
          <AventyCatalogueNotice withStoreLink />
        </div>
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
