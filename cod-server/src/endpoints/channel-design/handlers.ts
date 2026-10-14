import type { Context } from "hono";
import type { AppContext } from "@/types";
import { jsonBody } from "@/lib/route-builder";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/classes";
import { schedulePurge } from "@/platform/storefront-cache";
import { signPreviewToken } from "@/platform/design-preview";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import type { DesignError } from "../../../../cod-shared/channels/design";
import {
  channelHostname,
  discardDesignDraft,
  getDesignEditorState,
  publishDesign,
  restoreDesignVersion,
  saveDesignDraft,
} from "../../../../cod-shared/queries/channel-design";
import type { DraftInput, RestoreInput } from "./validation";

function invalid(errors: DesignError[]): never {
  throw new ValidationError("The design document does not match the template", ERROR_CODES.VALIDATION_FAILED, { errors });
}

async function state(c: Context<AppContext>) {
  const result = await getDesignEditorState(c.get("db"), c.get("storeId")!);
  if (!result) throw new NotFoundError("Store", c.get("storeId")!);
  return c.json({ success: true, data: result }, 200);
}

const actor = (c: Context<AppContext>) => c.get("user").name ?? c.get("user").email;

export const get = state;

export async function saveDraft(c: Context<AppContext>) {
  const result = await saveDesignDraft(c.get("db"), c.get("storeId")!, jsonBody<DraftInput>(c).document, actor(c));
  if (!result.ok) {
    if (result.reason === "invalid") invalid(result.errors);
    throw new NotFoundError("Store", c.get("storeId")!);
  }
  return state(c);
}

export async function discardDraft(c: Context<AppContext>) {
  await discardDesignDraft(c.get("db"));
  return state(c);
}

export async function publish(c: Context<AppContext>) {
  const result = await publishDesign(c.get("db"), c.get("storeId")!, actor(c));
  if (!result.ok) {
    if (result.reason === "invalid") invalid(result.errors);
    if (result.reason === "nothing_to_publish") {
      throw new ConflictError("There is no draft to publish", ERROR_CODES.DESIGN_NOTHING_TO_PUBLISH);
    }
    throw new NotFoundError("Store", c.get("storeId")!);
  }
  schedulePurge(c.env, c.get("storeId"));
  return state(c);
}

export async function restore(c: Context<AppContext>) {
  const { version } = jsonBody<RestoreInput>(c);
  const result = await restoreDesignVersion(c.get("db"), c.get("storeId")!, version, actor(c));
  if (!result.ok) {
    if (result.reason === "invalid") invalid(result.errors);
    throw new NotFoundError("Design version", String(version));
  }
  return state(c);
}

export async function preview(c: Context<AppContext>) {
  const storeId = c.get("storeId")!;
  const key = c.env.STOREFRONT_SERVICE_KEY;
  const hostname = await channelHostname(c.get("db"), storeId);
  if (!key || !hostname) throw new NotFoundError("Storefront address", storeId);
  return c.json({ success: true, data: { hostname, ...signPreviewToken(storeId, key) } }, 200);
}
