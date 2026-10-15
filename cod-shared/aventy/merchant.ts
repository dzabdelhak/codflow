const PREFIX = "aventy-";

export const aventyMerchantId = (ref: string) => `${PREFIX}${ref}`;

export const aventyRefOf = (merchantId: string): string | null =>
  merchantId.startsWith(PREFIX) && merchantId.length > PREFIX.length ? merchantId.slice(PREFIX.length) : null;

export const isAventyMerchant = (merchantId: string) => aventyRefOf(merchantId) !== null;

export const CHANNEL_PRODUCT_FIELDS: readonly string[] = ["showInStore", "storeFeatured", "shippingProfileId"];
