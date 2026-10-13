import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Settings2, Store } from "lucide-react";
import { DropdownItem, DropdownLink, DropdownMenu } from "@/components/ui";
import { useIdentity } from "@/features/auth/components/RequireAuth";
import { useT } from "@/i18n/react";
import { baseDomainOf } from "./store-choice";
import { switchToStore, useMerchantStores } from "./useMerchantStores";
import { CreateStoreDialog } from "./CreateStoreDialog";
import { StoreStatusBadge } from "./StoreManager";

/** Header dropdown: the active store, the merchant's other stores, and "Create store". */
export function StoreSwitcher() {
  const t = useT("navigation");
  const identity = useIdentity();
  const { stores, active, failed } = useMerchantStores();
  const [creating, setCreating] = useState(false);
  const isAdmin = identity?.role === "admin";

  const trigger = (
    <span className="flex min-w-0 items-center gap-2 text-start">
      <Store size={16} aria-hidden="true" className="shrink-0 text-white/75" />
      <span className="min-w-0">
        <span className="block max-w-40 truncate text-[13px] font-semibold leading-tight">
          {active?.name ?? (stores ? t("stores.none") : failed ? t("stores.load_failed") : t("stores.loading"))}
        </span>
        {active?.hostname && (
          <span className="hidden max-w-40 truncate text-[11px] leading-tight text-white/60 lg:block" dir="ltr">
            {active.hostname}
          </span>
        )}
      </span>
      <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-white/60" />
    </span>
  );

  return (
    <>
      <DropdownMenu
        trigger={trigger}
        triggerLabel={t("stores.switcher_label")}
        align="start"
        triggerClassName="flex min-w-0 max-w-64 items-center rounded-lg bg-white/10 px-2.5 py-1.5 text-white outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {stores?.map((store) => (
          <DropdownItem key={store.id} onClick={() => store.id !== active?.id && switchToStore(store.id)}>
            <Check
              size={15}
              aria-hidden="true"
              className={store.id === active?.id ? "shrink-0 text-brand" : "shrink-0 opacity-0"}
            />
            <span className="min-w-0 flex-1 py-1.5">
              <span className="block truncate leading-tight">{store.name}</span>
              {store.hostname && (
                <span className="block truncate text-[11px] font-normal text-muted-foreground" dir="ltr">
                  {store.hostname}
                </span>
              )}
            </span>
            <StoreStatusBadge status={store.status} />
          </DropdownItem>
        ))}
        <div role="separator" className="my-1 h-px bg-border" />
        <DropdownLink href="/stores">
          <Settings2 size={15} aria-hidden="true" className="shrink-0" />
          {t("stores.manage")}
        </DropdownLink>
        {isAdmin && (
          <DropdownItem onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" className="shrink-0" />
            {t("stores.create")}
          </DropdownItem>
        )}
      </DropdownMenu>
      {creating && <CreateStoreDialog baseDomain={baseDomainOf(stores ?? [])} onClose={() => setCreating(false)} />}
    </>
  );
}
