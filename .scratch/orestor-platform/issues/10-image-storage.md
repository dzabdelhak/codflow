# 10: Image upload and delivery on self-hosted storage

**What to build:** Product, banner, logo and landing images are uploaded to S3-compatible storage we host (MinIO), resized and served through our own image pipeline, replacing R2 and Cloudflare Images (including the landing-page image upload Workflow). Uploads are type- and size-checked.

**Blocked by:** 01

**Status:** done

- [x] A merchant uploads a product image and sees it resized on the storefront
- [x] Oversized or non-image files are refused with a clear message
- [x] No R2 or Cloudflare Images code remains
