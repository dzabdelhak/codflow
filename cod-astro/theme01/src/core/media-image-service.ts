/**
 * Astro image service: `<Image>` and its srcset ask the platform's image
 * pipeline for resized variants of our images (see utils/image-optimizer.ts);
 * other images are used as they are.
 */
import type { ExternalImageService } from "astro";
import { baseService } from "astro/assets";
import { optimizeImage } from "./utils/image-optimizer";

const service: ExternalImageService = {
  validateOptions: baseService.validateOptions,
  getHTMLAttributes: baseService.getHTMLAttributes,
  getSrcSet: baseService.getSrcSet,
  getURL(options) {
    if (typeof options.src !== "string") return options.src.src;
    const fit = options.fit === "contain" || options.fit === "inside" ? "contain" : "cover";
    return optimizeImage(options.src, { width: options.width, height: options.height, fit });
  },
};

export default service;
