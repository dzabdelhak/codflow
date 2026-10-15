import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { LinkButton } from "@/components/ui";
import { useT } from "@/i18n/react";
import { ProductForm } from "@/features/products/components/ProductForm";
import { AventyCatalogueNotice } from "@/features/products/components/AventyCatalogueNotice";
import { useMerchantStores } from "@/features/stores/useMerchantStores";

function Gated({ productId }: { productId?: string }) {
  const t = useT("products");
  const { catalogue, failed } = useMerchantStores();
  return (
    <DashboardChrome
      currentPath={productId ? `/products/${productId}/edit` : "/products/new"}
    >
      {(catalogue === "platform" || (failed && catalogue === null)) && <ProductForm productId={productId} />}
      {catalogue === "aventy" && (
        <div className="space-y-4">
          <AventyCatalogueNotice withStoreLink />
          <LinkButton href={productId ? `/products/${encodeURIComponent(productId)}` : "/products"} variant="secondary">
            {t(productId ? "aventy.view_product" : "aventy.back_to_products")}
          </LinkButton>
        </div>
      )}
    </DashboardChrome>
  );
}

export default function ProductFormPageApp({
  productId,
}: {
  productId?: string;
}) {
  return (
    <RequireAuth>
      <Gated productId={productId} />
    </RequireAuth>
  );
}
