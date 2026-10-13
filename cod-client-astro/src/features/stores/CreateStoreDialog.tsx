import { useState, type FormEvent } from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { createStore } from "./api";
import { suggestSubdomain } from "./store-choice";
import { switchToStore } from "./useMerchantStores";

export function CreateStoreDialog({ baseDomain, onClose }: { baseDomain: string | null; onClose: () => void }) {
  const t = useT("navigation");
  const common = useT("common");
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [error, setError] = useState<{ field: "name" | "subdomain" | "form"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const address = subdomain && baseDomain ? `${subdomain}.${baseDomain}` : null;

  function errorFor(cause: unknown): NonNullable<typeof error> {
    if (!(cause instanceof ApiError)) return { field: "form", message: t("stores.error_generic") };
    switch (cause.code) {
      case "STORE_LIMIT_REACHED":
        return {
          field: "form",
          message: t("stores.error_limit")
            .replace("{used}", String(cause.context?.used ?? ""))
            .replace("{limit}", String(cause.context?.limit ?? "")),
        };
      case "SUBDOMAIN_TAKEN":
        return { field: "subdomain", message: t("stores.error_taken") };
      case "INVALID_SUBDOMAIN":
        return { field: "subdomain", message: t("stores.error_invalid") };
      default:
        return { field: "form", message: t("stores.error_generic") };
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError({ field: "name", message: t("stores.error_name") });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const store = await createStore({ name: name.trim(), subdomain });
      switchToStore(store.id);
    } catch (cause) {
      setError(errorFor(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t("stores.create_title")}
      description={t("stores.create_description")}
      onClose={onClose}
      preventClose={busy}
      className="max-w-md"
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <Field label={t("stores.name_label")} error={error?.field === "name" ? error.message : undefined}>
          <Input
            value={name}
            maxLength={80}
            autoFocus
            placeholder={t("stores.name_placeholder")}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setName(value);
              if (!subdomainEdited) setSubdomain(suggestSubdomain(value));
            }}
          />
        </Field>
        <Field
          label={t("stores.subdomain_label")}
          error={error?.field === "subdomain" ? error.message : undefined}
          hint={address ? t("stores.subdomain_hint").replace("{address}", address) : t("stores.subdomain_rule")}
        >
          <Input
            value={subdomain}
            maxLength={40}
            dir="ltr"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              setSubdomainEdited(true);
              setSubdomain(event.currentTarget.value.toLowerCase());
            }}
          />
        </Field>
        {error?.field === "form" && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error.message}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {common("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
            {busy ? t("stores.creating") : t("stores.create_submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
