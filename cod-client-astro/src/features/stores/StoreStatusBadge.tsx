import { Badge, type BadgeTone } from "@/components/ui";
import { useT } from "@/i18n/react";
import type { ChannelStatus } from "../../../../cod-shared/channels/lifecycle";

const STATUS_TONE: Record<ChannelStatus, BadgeTone> = {
  draft: "neutral",
  configuring: "info",
  ready: "brand",
  published: "success",
  suspended: "warning",
  archived: "critical",
};

export function StoreStatusBadge({ status }: { status: ChannelStatus }) {
  const t = useT("navigation");
  return <Badge tone={STATUS_TONE[status]}>{t(`stores.status.${status}`)}</Badge>;
}
