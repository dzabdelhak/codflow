# Images

Product, category, landing-page and branding images are stored in
S3-compatible storage we host (MinIO in docker-compose), behind cod-server.
Nothing talks to the bucket but the API.

## How it works

1. The dashboard posts the file to `POST /api/images/upload` (multipart `file`,
   optional `folder`: `products`, `landing`, `branding`).
2. cod-server checks the real type from the bytes (JPEG, PNG, WebP or GIF),
   the size (10 MB) and the pixels (50 megapixels), converts it with sharp to
   WebP (at most 2400 px on its longest side), stores it under
   `<folder>/<32 hex>.webp` and returns `{ key, url, width, height }`.
3. The dashboard saves the record (e.g. `POST /api/products/:id/images` with
   `{ key, src: url, width, height }`).
4. `GET /images/<key>` serves the stored image (streamed). With `?w=` it
   serves a WebP at the next width of a fixed list (80 … 2000, 13 widths,
   proportions kept, never enlarged), rendered once — concurrent requests share
   the render — and kept beside the original as `<key>~w<width>`. The
   storefront crops with CSS.

Deleting an image removes the object and its variants. The orphan sweep
(`src/cron/sweep-orphan-images.ts`) covers every folder and runs as a daily dry
run on each API server, logging what it would delete.

Agents (MCP) upload landing images by URL: the download refuses any address
that is not on the public internet (`src/platform/safe-download.ts`), checking
each resolved address and every redirect. Code lives in
`src/platform/image-store.ts` (S3/MinIO, and an in-memory store for tests) and
`src/platform/image-pipeline.ts` (checks, conversion, variants).

## Configuration (cod-server)

| Variable | Meaning |
|---|---|
| `S3_ENDPOINT` | MinIO/S3 endpoint, e.g. `http://minio:9000` |
| `S3_BUCKET` | Bucket (default `codflow-images`; created at start-up if missing) |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Credentials (compose: `COD_S3_ACCESS_KEY`, `COD_S3_SECRET_KEY`) |
| `S3_REGION` | Optional (default `us-east-1`) |
| `IMAGES_PUBLIC_URL` | Public base of `/images`, e.g. `https://api.example.com/images` (default: the request's origin) |

The storefront's `MEDIA_URL` is the same public base: theme01 asks for resized
versions of images under it (`src/core/utils/image-optimizer.ts`).

## Moving images off R2

A deployment coming from Cloudflare copies its images once and rewrites the
stored URLs (idempotent; exits 2 if some images could not be downloaded):

```sh
DATABASE_URL=… S3_ENDPOINT=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
  npm run images:import-legacy -- --from=https://media.yourdomain.com --to=https://api.yourdomain.com/images
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/images/upload` | `products:manage` | Upload, check and store as WebP (≤ 10 MB) |
| `GET` | `/images/:key` | none | Serve an image or a resized variant |

The serve route uses plain Hono (not OpenAPIHono) because the `:key{.+}` regex
param is required for keys containing slashes; it is documented through
`openapi.ts`.
