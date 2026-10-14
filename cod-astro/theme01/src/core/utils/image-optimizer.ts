import { MEDIA_URL as _MEDIA_URL } from "astro:env/server";

const MEDIA_URL = (_MEDIA_URL ?? "").replace(/\/$/, "");

export interface ImageResizeOptions {
  width?: number;
}

export function isMediaUrl(url: string): boolean {
  return !!MEDIA_URL && url.startsWith(`${MEDIA_URL}/`);
}

export function mediaOrigin(): string | null {
  return MEDIA_URL ? new URL(MEDIA_URL).origin : null;
}

export function optimizeImage(originalUrl: string, { width }: ImageResizeOptions): string {
  if (!originalUrl || !width || !isMediaUrl(originalUrl)) return originalUrl;
  return `${originalUrl.split("?")[0]}?w=${Math.round(width)}`;
}

export const IMAGE_SIZES = {
  CARD: { width: 400 },
  GALLERY_MAIN: { width: 800 },
  GALLERY_THUMB: { width: 160 },
  HERO: { width: 1200 },
  CATEGORY: { width: 320 },
  LOGO: { width: 240 },
} as const;

export const getCardImage = (url: string) => optimizeImage(url, IMAGE_SIZES.CARD);
export const getGalleryImage = (url: string) => optimizeImage(url, IMAGE_SIZES.GALLERY_MAIN);
export const getThumbnailImage = (url: string) => optimizeImage(url, IMAGE_SIZES.GALLERY_THUMB);
export const getHeroImage = (url: string) => optimizeImage(url, IMAGE_SIZES.HERO);
export const getCategoryImage = (url: string) => optimizeImage(url, IMAGE_SIZES.CATEGORY);
export const getLogoImage = (url: string) => optimizeImage(url, IMAGE_SIZES.LOGO);
