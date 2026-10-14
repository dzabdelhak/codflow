import type { ExternalImageService } from "astro";
import { baseService } from "astro/assets";
import { optimizeImage } from "./utils/image-optimizer";

const service: ExternalImageService = {
  validateOptions: baseService.validateOptions,
  getHTMLAttributes: baseService.getHTMLAttributes,
  getSrcSet: baseService.getSrcSet,
  getURL(options) {
    if (typeof options.src !== "string") return options.src.src;
    return optimizeImage(options.src, { width: options.width });
  },
};

export default service;
