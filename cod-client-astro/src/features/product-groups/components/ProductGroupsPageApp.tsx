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
import { ProductGroupsList } from "@/features/product-groups/components/ProductGroupsList";
import { useAventyCatalogue } from "@/features/stores/useMerchantStores";
import { AventyCatalogueNotice } from "@/features/products/components/AventyCatalogueNotice";

function Gated() {
  const t = useT("product-groups");
  const identity = useIdentity();
  const aventy = useAventyCatalogue();
  return (
    <DashboardChrome currentPath="/product-groups">
      <ChannelOnly type="store">
        <PageHeader
          title={t("page_title")}
          actions={
            canScope(identity, SCOPES.PRODUCT_GROUPS_MANAGE) && !aventy ? (
              <LinkButton href="/product-groups/new">
                <Plus size={16} />
                {t("add_group")}
              </LinkButton>
            ) : undefined
          }
        />
        <div className="mb-3">
          <AventyCatalogueNotice />
        </div>
        <ProductGroupsList />
      </ChannelOnly>
    </DashboardChrome>
  );
}

export default function ProductGroupsPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
