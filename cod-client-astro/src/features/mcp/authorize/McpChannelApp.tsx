import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { useT } from "@/i18n/react";
import { chooseChannel, continueAuthorization, getChannelChoice, type ChannelOption } from "./api";

export default function McpChannelApp() {
  const t = useT("mcp");
  const [channels, setChannels] = useState<ChannelOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getChannelChoice().then((choice) => {
      if (!choice) {
        window.location.href = `/sign-in${window.location.search}`;
        return;
      }
      setChannels(choice.channels);
    }, () => setFailed(true));
  }, []);

  async function pick(channel: ChannelOption) {
    setBusy(channel.id);
    setFailed(false);
    try {
      const next = (await chooseChannel(channel.id)) ? await continueAuthorization() : null;
      if (next) window.location.href = next;
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-12">
      <div>
        <h1 className="text-2xl font-bold">{t("authorize.channel_title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("authorize.channel_subtitle")}</p>
      </div>
      {failed && <Alert role="alert" tone="critical">{t("authorize.error")}</Alert>}
      {!channels ? (
        <p className="text-sm text-muted-foreground" role="status">…</p>
      ) : channels.length === 0 ? (
        <Alert tone="warning">{t("authorize.no_channel")}</Alert>
      ) : (
        <ul className="space-y-2">
          {channels.map((channel) => (
            <li key={channel.id}>
              <Button
                type="button"
                variant="secondary"
                className="h-auto w-full justify-start gap-3 py-3 text-start"
                disabled={busy !== null}
                aria-busy={busy === channel.id}
                onClick={() => void pick(channel)}
              >
                <Store size={18} aria-hidden="true" />
                <span className="flex-1">
                  <span className="block font-semibold">{channel.name}</span>
                  <span className="block text-xs text-muted-foreground">{t(`authorize.type_${channel.type}`)}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
