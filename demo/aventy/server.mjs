import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const SECRET = process.env.AVENTY_LINK_SECRET;
const PLATFORM = (process.env.ORESTOR_APP_URL ?? "http://app.localhost:8090").replace(/\/$/, "");
const PORT = Number(process.env.PORT ?? 8080);
if (!SECRET) throw new Error("AVENTY_LINK_SECRET is required");

const photo = (id) => `https://images.unsplash.com/photo-${id}?w=160&h=160&fit=crop&q=70`;
const PRODUCTS = [
  ["Montre connectée Sport X8", 6900, 40, "1546868871-7041f2a55e12"],
  ["Casque Bluetooth à réduction de bruit", 7500, 40, "1505740420928-5e560c06d30e"],
  ["Écouteurs sans fil Pro", 4200, 40, "1590658268037-6bf12165a8df"],
  ["Montre minimaliste blanche", 3900, 40, "1523275335684-37898b6baf30"],
  ["Lunettes de soleil polarisées", 2500, 40, "1572635196237-14b3f281503f"],
  ["Sac à dos urbain imperméable", 4800, 40, "1553062407-98eeb64c6a62"],
  ["Baskets running légères", 6500, 60, "1491553895911-0055eca6402d"],
  ["Baskets en toile bordeaux", 4500, 60, "1525966222134-fcfa99b8ae77"],
  ["Sérum à l'huile d'argan", 2900, 40, "1617897903246-719242758050"],
  ["Crème hydratante visage", 2200, 40, "1620916566398-39f1143ab7be"],
  ["Bracelet plaqué or", 3500, 40, "1611591437281-460bfbe1220a"],
];

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `${n.toLocaleString("fr-DZ")} DA`;
const slug = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "boutique";

function signLink({ shop, email, name }) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = { ref: slug(shop), shop, email, name, iat, exp: iat + 120, jti: randomUUID() };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

function page({ shop, email, name }) {
  const rows = PRODUCTS.map(([title, price, stock, img]) => `
        <tr><td><img src="${photo(img)}" alt=""></td><td>${escape(title)}</td><td>${money(price)}</td><td>${stock}</td><td><span class="pill">En ligne</span></td></tr>`).join("");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aventy — espace vendeur (démo)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --ink:#0b1b33; --muted:#5b6b82; --line:#e6ebf2; --brand:#ff5a1f; --brand-2:#ff8a3d; --bg:#f5f7fb; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, system-ui, sans-serif; color:var(--ink); background:var(--bg); }
  .app { display:grid; grid-template-columns: 232px 1fr; min-height:100vh; }
  aside { background:var(--ink); color:#c9d4e5; padding:22px 16px; }
  .logo { display:flex; align-items:center; gap:10px; font-weight:800; font-size:22px; color:#fff; margin-bottom:28px; }
  .logo b { display:grid; place-items:center; width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,var(--brand),var(--brand-2)); color:#fff; }
  nav a { display:block; padding:10px 12px; border-radius:10px; color:inherit; text-decoration:none; font-weight:500; margin-bottom:4px; }
  nav a.on { background:rgba(255,255,255,.08); color:#fff; }
  .demo { margin-top:28px; font-size:12px; color:#8fa0bb; border-top:1px solid rgba(255,255,255,.08); padding-top:14px; }
  main { padding:28px 36px; }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
  h1 { font-size:24px; margin:0; }
  .who { color:var(--muted); font-size:14px; }
  .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; margin-bottom:22px; }
  .stat { background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .stat small { color:var(--muted); } .stat div { font-size:26px; font-weight:800; margin-top:6px; }
  .channel { display:flex; gap:22px; align-items:center; justify-content:space-between; background:linear-gradient(120deg,#101f3a,#1d3a6b); color:#fff; border-radius:18px; padding:24px 28px; margin-bottom:22px; }
  .channel h2 { margin:0 0 6px; font-size:20px; } .channel p { margin:0; color:#c9d4e5; max-width:560px; line-height:1.5; }
  .channel form { display:flex; flex-direction:column; gap:8px; min-width:280px; }
  .channel input { border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.08); color:#fff; border-radius:10px; padding:9px 12px; font:inherit; font-size:14px; }
  .channel label { font-size:12px; color:#9fb0cc; }
  button { cursor:pointer; border:0; border-radius:12px; padding:13px 18px; font:inherit; font-weight:700; font-size:15px; color:#fff; background:linear-gradient(135deg,var(--brand),var(--brand-2)); box-shadow:0 8px 24px rgba(255,90,31,.35); }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  th, td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--line); font-size:14px; }
  th { color:var(--muted); font-weight:600; background:#fafbfd; }
  td img { width:44px; height:44px; border-radius:8px; object-fit:cover; display:block; }
  .pill { background:#e8f7ee; color:#137a3d; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:600; }
  @media (max-width: 900px) { .app { grid-template-columns:1fr; } aside { display:none; } .grid { grid-template-columns:1fr; } .channel { flex-direction:column; align-items:stretch; } main { padding:18px 16px; } }
</style>
</head>
<body>
<div class="app">
  <aside>
    <div class="logo"><b>A</b> Aventy</div>
    <nav>
      <a href="#">Tableau de bord</a>
      <a class="on" href="#">Produits</a>
      <a href="#">Commandes</a>
      <a href="#">Livraison</a>
      <a href="#">Canaux de vente</a>
    </nav>
    <div class="demo">Maquette de démonstration — pas le vrai site Aventy.</div>
  </aside>
  <main>
    <header>
      <div><h1>${escape(shop)}</h1><div class="who">${escape(name)} · ${escape(email)}</div></div>
    </header>
    <div class="grid">
      <div class="stat"><small>Produits en ligne</small><div>${PRODUCTS.length}</div></div>
      <div class="stat"><small>Commandes ce mois</small><div>128</div></div>
      <div class="stat"><small>Wilayas livrées</small><div>58</div></div>
    </div>
    <section class="channel">
      <div>
        <h2>Vendez sur votre propre boutique</h2>
        <p>Créez une boutique ou une landing page à partir de vos produits Aventy, en quelques minutes. Les commandes reviennent dans Aventy.</p>
      </div>
      <form method="post" action="/launch">
        <label for="shop">Nom de la boutique</label>
        <input id="shop" name="shop" value="${escape(shop)}" maxlength="80" required>
        <label for="name">Vendeur</label>
        <input id="name" name="name" value="${escape(name)}" maxlength="80" required>
        <label for="email">E-mail du vendeur</label>
        <input id="email" name="email" type="email" value="${escape(email)}" required>
        <button type="submit">Créer un canal de vente →</button>
      </form>
    </section>
    <table>
      <thead><tr><th></th><th>Produit</th><th>Prix</th><th>Stock</th><th>Statut</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table>
  </main>
</div>
</body>
</html>`;
}

const DEFAULTS = { shop: "Maison Lina", email: "lina@example.com", name: "Lina Benali" };

async function formOf(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) break;
  }
  const form = new URLSearchParams(raw);
  const pick = (key) => (form.get(key) ?? "").trim().slice(0, 120) || DEFAULTS[key];
  return { shop: pick("shop"), email: pick("email").toLowerCase(), name: pick("name") };
}

createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/launch") {
    const token = signLink(await formOf(req));
    res.writeHead(303, { Location: `${PLATFORM}/api/auth/aventy/enter?token=${token}`, "Cache-Control": "no-store" });
    return res.end();
  }
  if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(page(DEFAULTS));
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`mock Aventy on :${PORT} → ${PLATFORM}`));
