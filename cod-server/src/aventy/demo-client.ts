import type { AventyClient, AventyDeliveryGrid, AventyProductCopy } from "./client";

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=80`;
const electronics = { id: "demo-electronique", name: "Électronique" };
const accessories = { id: "demo-accessoires", name: "Accessoires" };
const fashion = { id: "demo-mode", name: "Mode" };
const beauty = { id: "demo-beaute", name: "Beauté" };

const product = (
  id: string,
  name: string,
  price: number,
  compareAtPrice: number | null,
  category: AventyProductCopy["category"],
  image: string,
  description: string,
  variants: AventyProductCopy["variants"] = [],
): AventyProductCopy => ({
  id, version: 1, name, description, price, compareAtPrice, category, images: [photo(image)],
  sku: variants.length > 0 ? null : id.toUpperCase(), reserve: 40, variants,
});

const sizes = (id: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ sku: `${id.toUpperCase()}-${from + i}`, options: { Pointure: String(from + i) }, price: null, reserve: 12 }));

export const DEMO_CATALOGUE: AventyProductCopy[] = [
  product("av-1001", "Montre connectée Sport X8", 6900, 8900, electronics, "1546868871-7041f2a55e12",
    "Suivi du sommeil, du rythme cardiaque et des pas, notifications d'appels et de messages, autonomie de 7 jours.",
    [
      { sku: "AV-1001-NOIR", options: { Couleur: "Noir" }, price: null, reserve: 25 },
      { sku: "AV-1001-ARGENT", options: { Couleur: "Argent" }, price: 7200, reserve: 15 },
    ]),
  product("av-1002", "Casque Bluetooth à réduction de bruit", 7500, 9500, electronics, "1505740420928-5e560c06d30e",
    "Réduction active du bruit, 30 heures d'écoute, pliable, livré avec son étui."),
  product("av-1003", "Écouteurs sans fil Pro", 4200, 5500, electronics, "1590658268037-6bf12165a8df",
    "Boîtier de charge, son clair, micro pour les appels, résistants à la transpiration."),
  product("av-1004", "Montre minimaliste blanche", 3900, null, accessories, "1523275335684-37898b6baf30",
    "Cadran épuré, bracelet en silicone, étanche aux éclaboussures."),
  product("av-1005", "Lunettes de soleil polarisées", 2500, 3200, accessories, "1572635196237-14b3f281503f",
    "Verres polarisés UV400, monture légère, étui inclus."),
  product("av-1006", "Sac à dos urbain imperméable", 4800, null, accessories, "1553062407-98eeb64c6a62",
    "Compartiment pour ordinateur 15,6 pouces, tissu déperlant, poche antivol au dos."),
  product("av-1007", "Baskets running légères", 6500, 7900, fashion, "1491553895911-0055eca6402d",
    "Semelle amortissante, tige respirante, idéales pour la course et la marche.", sizes("av-1007", 40, 44)),
  product("av-1008", "Baskets en toile bordeaux", 4500, null, fashion, "1525966222134-fcfa99b8ae77",
    "Toile résistante, semelle en caoutchouc, style intemporel.", sizes("av-1008", 39, 43)),
  product("av-1009", "Sérum à l'huile d'argan", 2900, null, beauty, "1617897903246-719242758050",
    "Huile d'argan pure pour le visage et les cheveux, flacon compte-gouttes de 30 ml."),
  product("av-1010", "Crème hydratante visage", 2200, 2800, beauty, "1620916566398-39f1143ab7be",
    "Hydratation 24 heures, texture légère, tous types de peau."),
  product("av-1011", "Bracelet plaqué or", 3500, null, accessories, "1611591437281-460bfbe1220a",
    "Maillons plaqués or 18 carats, fermoir sécurisé, livré dans son écrin."),
];

export const DEMO_DELIVERY_GRID: AventyDeliveryGrid = {
  version: 1,
  rules: Array.from({ length: 58 }, (_, i) => {
    const wilayaId = i + 1;
    if (wilayaId === 16) return { wilayaId, home: 400, stopDesk: 250 };
    const far = [1, 8, 11, 30, 32, 33, 37, 39, 45, 47, 49, 50, 52, 53, 54, 55, 56, 57, 58].includes(wilayaId);
    return { wilayaId, home: far ? 1200 : 700, stopDesk: far ? 800 : 450 };
  }),
};

export function demoAventyClient(): AventyClient {
  let sent = 0;
  const received = new Map<string, string>();
  return {
    async heartbeat() {
      return { changed: [] };
    },
    async catalogueSnapshot() {
      return { cursor: "demo-1", products: DEMO_CATALOGUE };
    },
    async catalogueChanges(_key, cursor) {
      return { cursor, products: [], removed: [] };
    },
    async deliveryGrid() {
      return { cursor: "demo-1", grid: DEMO_DELIVERY_GRID };
    },
    async merchantSnapshot() {
      return { products: DEMO_CATALOGUE, grid: DEMO_DELIVERY_GRID };
    },
    async sendOrder(_key, { sendId }) {
      const known = received.get(sendId);
      if (known) return { kind: "duplicate", remoteId: known };
      const remoteId = `AV-${String(++sent).padStart(6, "0")}`;
      received.set(sendId, remoteId);
      return { kind: "accepted", remoteId };
    },
  };
}
