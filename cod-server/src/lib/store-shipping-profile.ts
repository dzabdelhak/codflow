import type { AppDb } from "@/db";
import { ValidationError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../cod-shared/errors/codes";
import { isStoreShippingProfile } from "../../../cod-shared/queries/channel-products";

export async function assertStoreShippingProfile(db: AppDb, profileId: string | null | undefined): Promise<void> {
  if (profileId && !(await isStoreShippingProfile(db, profileId))) {
    throw new ValidationError("This shipping profile does not belong to the store", ERROR_CODES.VALIDATION_FAILED, {
      field: "shippingProfileId",
    });
  }
}
