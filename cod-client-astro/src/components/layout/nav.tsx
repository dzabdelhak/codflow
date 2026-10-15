import {
  Building2,
  ClipboardList,
  FileText,
  FolderOpen,
  Gift,
  Globe,
  Layers,
  Megaphone,
  Palette,
  MessageCircle,
  MessagesSquare,
  LayoutDashboard,
  Package,
  PackageX,
  Settings,
  Shield,
  ShieldX,
  ShoppingCart,
  Sparkles,
  Crosshair,
  Send,
  Star,
  Store,
  Tag,
  Truck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { useT } from "@/i18n/react";
import { useMerchantStores } from "@/features/stores/useMerchantStores";
import { aventyManagedArea } from "@/features/stores/aventy-areas";
import type { ChannelType } from "../../../../cod-shared/channels/types";

export type NavLeaf = {
  kind: "leaf";
  label: string;
  icon: LucideIcon;
  href: string;
  scope?: string;
  badge?: string;
  channel?: ChannelType;
};

export type NavGroup = {
  kind: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  scope?: string;
  badge?: string;
  children: NavLeaf[];
};

export type NavNode = NavLeaf | NavGroup;

export type NavSection = {
  label: string;
  items: NavNode[];
};

export function useNavSections(): NavSection[] {
  const identity = useIdentity();
  const tN = useT("navigation");
  const merchantStores = useMerchantStores();
  const channelType = merchantStores.failed ? "store" : merchantStores.active?.type;
  const landing = channelType === "landing";
  const aventy = merchantStores.catalogue === "aventy";
  const sections: NavSection[] = [
    {
      label: tN("sidebar.general"),
      items: [
        {
          kind: "leaf",
          href: "/dashboard",
          label: tN("sidebar.dashboard"),
          icon: LayoutDashboard,
          scope: "dashboard:view",
        },
        {
          kind: "group",
          id: "orders",
          label: tN("sidebar.orders"),
          icon: ShoppingCart,
          scope: "orders:read",
          children: [
            {
              kind: "leaf",
              href: "/orders",
              label: tN("sidebar.orders_all"),
              icon: ShoppingCart,
              scope: "orders:read",
            },
            {
              kind: "leaf",
              href: "/orders/abandoned",
              label: tN("sidebar.orders_abandoned"),
              icon: PackageX,
              scope: "abandoned_orders:read",
            },
            {
              kind: "leaf",
              href: "/orders/blocked",
              label: tN("sidebar.orders_blocked"),
              icon: ShieldX,
              scope: "orders:read",
            },
            {
              kind: "leaf",
              href: "/orders/transmission",
              label: tN("sidebar.orders_transmission"),
              icon: Send,
              scope: "orders:read",
            },
          ],
        },
        {
          kind: "group",
          id: "customers",
          label: tN("sidebar.customers"),
          icon: Users,
          scope: "customers:read",
          children: [
            {
              kind: "leaf",
              href: "/customers",
              label: tN("sidebar.customers"),
              icon: Users,
              scope: "customers:read",
            },
            {
              kind: "leaf",
              href: "/customer-groups",
              label: tN("sidebar.customer_groups"),
              icon: Layers,
              scope: "customer_groups:read",
            },
            {
              kind: "leaf",
              href: "/customer-tags",
              label: tN("sidebar.customer_tags"),
              icon: Tag,
              scope: "customer_tags:read",
            },
          ],
        },
        {
          kind: "leaf",
          href: "/reviews",
          label: tN("sidebar.reviews"),
          icon: Star,
          scope: "reviews:read",
        },
      ],
    },
    {
      label: tN("sidebar.inventory"),
      items: [
        {
          kind: "group",
          id: "products",
          label: tN("sidebar.products"),
          icon: Layers,
          href: channelType === undefined ? undefined : landing ? "/products/main" : "/products",
          scope: "products:read",
          children: [
            {
              kind: "leaf",
              href: "/products/main",
              label: tN("sidebar.main_product"),
              icon: Crosshair,
              scope: "products:read",
              channel: "landing",
            },
            {
              kind: "leaf",
              href: "/products/store",
              label: tN("sidebar.store_products"),
              icon: Store,
              scope: "products:read",
              channel: "store",
            },
            {
              kind: "leaf",
              href: "/product-groups",
              label: tN("sidebar.categories"),
              icon: FolderOpen,
              scope: "product_groups:read",
              channel: "store",
            },
            {
              kind: "leaf",
              href: "/products/stock",
              label: tN("sidebar.stock_management"),
              icon: Package,
              scope: "products:read",
            },
            {
              kind: "leaf",
              href: "/offers",
              label: tN("sidebar.offers"),
              icon: Gift,
              scope: "offers:read",
            },
            {
              kind: "leaf",
              href: "/landing-pages",
              label: tN("sidebar.landing_pages"),
              icon: Megaphone,
              scope: "landing_pages:read",
              channel: "store",
            },
          ],
        },
        {
          kind: "group",
          id: "delivery",
          label: tN("sidebar.delivery"),
          icon: Truck,
          scope: "delivery:read",
          children: [
            {
              kind: "leaf",
              href: "/delivery/drivers",
              label: tN("sidebar.delivery_drivers"),
              icon: Truck,
              scope: "delivery:read",
            },
            {
              kind: "leaf",
              href: "/delivery/companies",
              label: tN("sidebar.delivery_companies"),
              icon: Building2,
              scope: "delivery:read",
            },
            {
              kind: "leaf",
              href: "/delivery/shipping-profiles",
              label: tN("sidebar.delivery_shipping"),
              icon: Package,
              scope: "delivery:read",
            },
          ],
        },
      ],
    },
    {
      label: tN("sidebar.system"),
      items: [
        {
          kind: "leaf",
          href: "/stores",
          label: tN("sidebar.stores"),
          icon: Store,
        },
        {
          kind: "leaf",
          href: "/design",
          label: tN("sidebar.design"),
          icon: Palette,
          scope: "admin",
        },
        {
          kind: "leaf",
          href: "/domains",
          label: tN("sidebar.domains"),
          icon: Globe,
          scope: "admin",
        },
        {
          kind: "leaf",
          href: "/team",
          label: tN("sidebar.team"),
          icon: Shield,
          scope: "admin",
        },
        {
          kind: "leaf",
          href: "/mcp",
          label: tN("sidebar.mcp"),
          icon: Sparkles,
          scope: "mcp:view",
        },
        {
          kind: "leaf",
          href: "/pages",
          label: tN("sidebar.store_pages"),
          icon: FileText,
          scope: "store_pages:read",
        },
        {
          kind: "leaf",
          href: "/checkout-form",
          label: tN("sidebar.checkout_form"),
          icon: ClipboardList,
          scope: "checkout_form:read",
        },
        {
          kind: "leaf",
          href: "/whatsapp",
          label: tN("sidebar.whatsapp"),
          icon: MessageCircle,
          scope: "whatsapp_widget:read",
        },
        {
          kind: "leaf",
          href: "/messenger",
          label: tN("sidebar.messenger"),
          icon: MessagesSquare,
          scope: "admin",
        },
        {
          kind: "leaf",
          href: "/settings",
          label: tN("sidebar.settings"),
          icon: Settings,
          scope: "admin",
        },
      ],
    },
  ];

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) =>
          item.kind === "group"
            ? {
                ...item,
                children: item.children.filter(
                  (child) =>
                    !(aventy && aventyManagedArea(child.href)) &&
                    (!child.channel || child.channel === channelType) &&
                    (!child.scope ||
                    child.scope === "admin"
                      ? identity?.role === "admin"
                      : canScope(identity, child.scope)),
                ),
              }
            : item,
        )
        .filter((item) => {
          if (item.kind === "leaf" && aventy && aventyManagedArea(item.href)) return false;
          if (item.scope) {
            if (item.scope === "admin") {
              if (identity?.role !== "admin") return false;
            } else if (!canScope(identity, item.scope)) {
              return false;
            }
          }
          if (item.kind === "group") return item.children.length > 0;
          return true;
        }),
    }))
    .filter((section) => section.items.length > 0);
}

export function isCurrentPath(currentPath: string, href: string): boolean {
  if (href === "/") return currentPath === "/";
  if (href === "/orders") {
    return (
      currentPath === "/orders" ||
      (currentPath.startsWith("/orders/") &&
        currentPath !== "/orders/abandoned" &&
        currentPath !== "/orders/blocked" &&
        currentPath !== "/orders/transmission")
    );
  }
  if (href === "/products") {
    return (
      currentPath === "/products" ||
      (currentPath.startsWith("/products/") &&
        currentPath !== "/products/stock" &&
        currentPath !== "/products/store" &&
        currentPath !== "/products/main")
    );
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}
