import { Badge, type BadgeTone } from "@/components/ui";
import { useT } from "@/i18n/react";
import { storeSelectionState, type StoreSelectionState } from "@/features/products/model";
import type { Product } from "@/features/products/types";

const SELECTION_TONE: Record<StoreSelectionState, BadgeTone> = {
  not_in_store: "neutral",
  hidden_in_store: "warning",
  published: "success",
  featured: "brand",
};

export function StoreSelectionBadge({ product }: { product: Pick<Product, "inChannel" | "showInStore" | "storeFeatured"> }) {
  const t = useT("products");
  const state = storeSelectionState(product);
  return <Badge tone={SELECTION_TONE[state]}>{t(`store_selection.state.${state}`)}</Badge>;
}
