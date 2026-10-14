import pg from "pg";
import { s3ImageStore } from "../src/platform/image-store";
import { importLegacyImages } from "../src/platform/image-import";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const from = arg("from");
const to = arg("to") ?? process.env.IMAGES_PUBLIC_URL;
const missing = ["DATABASE_URL", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((name) => !process.env[name]);
if (!from || !to || missing.length > 0) {
  console.error("Usage: DATABASE_URL=… S3_ENDPOINT=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npm run images:import-legacy -- --from=https://media.example.com [--to=<IMAGES_PUBLIC_URL>]");
  if (missing.length > 0) console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const store = s3ImageStore({
  endpoint: process.env.S3_ENDPOINT!,
  bucket: process.env.S3_BUCKET ?? "codflow-images",
  accessKeyId: process.env.S3_ACCESS_KEY_ID!,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  region: process.env.S3_REGION,
});
async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await store.ensureBucket();
    const report = await importLegacyImages(client, store, { oldBase: from!, newBase: to! });
    console.log(JSON.stringify(report, null, 2));
    if (report.missing.length > 0) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
