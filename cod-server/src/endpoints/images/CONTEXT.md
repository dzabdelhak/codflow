# Images Context

Getting merchant pictures into our own object storage and back out to shoppers
fast: one upload path through the API, one public serving route with resized
variants, and a strict split between the stored bytes and the database records
that reference them.

## Language

### Storage

**Image Store**:
The S3-compatible bucket (SeaweedFS in compose) behind cod-server, reached only through
`ImageStore` (`src/platform/image-store.ts`). Browsers never write to it.
_Avoid_: CDN, media server

**Object Key**:
The storage address of every image — `<folder>/` (`products`, `landing`,
`branding`) plus 32 hex characters and `.webp`. Generated server-side; clients
never name their own files.
_Avoid_: File path, filename

**Immutable Media**:
Every image is written and served with one-year immutable cache headers. A
stored image's content never changes; replacing means uploading under a new key.
_Avoid_: Editable asset, cache busting

**Variant**:
A resized WebP of an image at one of 13 fixed widths, rendered on first request
and kept beside it as `<key>~w<width>`. A variant lives and dies with its image
(deletes and the orphan sweep treat it so).

### Upload

**Ingest**:
The one path every upload takes (`ingestImage`): the type is read from the
bytes, never from the name or the declared type; at most 10 MB; converted to
WebP, at most 2400 px on the longest side. A file that is not a JPEG, PNG,
WebP or GIF, above 50 megapixels, or cannot be decoded, is refused with a
message the merchant understands.

### Housekeeping

**Orphan**:
An object in an upload folder that no stored data references and that is older
than the grace period. `collectReferencedImageKeys` lists every reference
source; the sweep deletes only orphans, and runs as a dry run unless asked.
