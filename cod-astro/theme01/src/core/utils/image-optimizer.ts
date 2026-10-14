/**
 * Resized images from the platform's image pipeline (cod-server `/images`).
 *
 * MEDIA_URL is the public base of that service (e.g.
 * "https://api.example.com/images"). Images under it are resized on request
 * with `?w=&h=&fit=`; any other URL passes through unchanged, as everything
 * does when MEDIA_URL is unset.
 */
import { MEDIA_URL as _MEDIA_URL } from "astro:env/server";

const MEDIA_URL = (_MEDIA_URL ?? "").replace(/\/$/, "");

export interface ImageResizeOptions {
  width?: number;
  height?: number;
  fit?: "cover" | "contain";
}

export function isMediaUrl(url: string): boolean {
  return !!MEDIA_URL && url.startsWith(`${MEDIA_URL}/`);
}

export function mediaOrigin(): string | null {
  return MEDIA_URL ? new URL(MEDIA_URL).origin : null;
}

export function optimizeImage(originalUrl: string, { width, height, fit }: ImageResizeOptions): string {
  if (!originalUrl || !isMediaUrl(originalUrl)) return originalUrl;
  const params = new URLSearchParams();
  if (width) params.set("w", String(Math.round(width)));
  if (height) params.set("h", String(Math.round(height)));
  if (width && height && fit) params.set("fit", fit);
  const query = params.toString();
  return query ? `${originalUrl.split("?")[0]}?${query}` : originalUrl;
}

export const IMAGE_SIZES = {
  CARD: { width: 400, height: 400 },
  GALLERY_MAIN: { width: 800, height: 800 },
  GALLERY_THUMB: { width: 80, height: 80 },
  HERO: { width: 1200, height: 600 },
  CATEGORY: { width: 300, height: 200 },
  LOGO: { width: 200, height: 80, fit: "contain" as const },
} as const;

export const getCardImage = (url: string) => optimizeImage(url, IMAGE_SIZES.CARD);
export const getGalleryImage = (url: string) => optimizeImage(url, IMAGE_SIZES.GALLERY_MAIN);
export const getThumbnailImage = (url: string) => optimizeImage(url, IMAGE_SIZES.GALLERY_THUMB);
export const getHeroImage = (url: string) => optimizeImage(url, IMAGE_SIZES.HERO);
export const getCategoryImage = (url: string) => optimizeImage(url, IMAGE_SIZES.CATEGORY);
export const getLogoImage = (url: string) => optimizeImage(url, IMAGE_SIZES.LOGO);
