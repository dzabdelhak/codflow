const AVENTY_AREAS = [
  { area: "customers", prefixes: ["/customers", "/customer-groups", "/customer-tags"] },
  { area: "delivery", prefixes: ["/delivery"] },
  { area: "team", prefixes: ["/team"] },
] as const;

export function aventyManagedArea(path: string): (typeof AVENTY_AREAS)[number]["area"] | null {
  return AVENTY_AREAS.find(({ prefixes }) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))?.area ?? null;
}
