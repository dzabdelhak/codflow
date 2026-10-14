import type { ReactNode } from "react";
import { Alert } from "@/components/ui";
import { useT } from "@/i18n/react";
import type { ChannelType } from "../../../../cod-shared/channels/types";
import { useMerchantStores } from "./useMerchantStores";

export function ChannelOnly({ type, children }: { type: ChannelType; children: ReactNode }) {
  const t = useT("products");
  const { active, failed } = useMerchantStores();
  if (!active && !failed) return null;
  if (!active || active.type === type) return <>{children}</>;
  return (
    <Alert tone="info">
      {type === "store" ? (
        <>
          {t("main_product.store_only")}{" "}
          <a href="/products/main" className="font-semibold underline">
            {t("main_product.go_main_product")}
          </a>
        </>
      ) : (
        t("main_product.landing_only")
      )}
    </Alert>
  );
}
