import { describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({ MEDIA_URL: "https://api.example.com/images/" }));

const { optimizeImage, getThumbnailImage, mediaOrigin } = await import("./image-optimizer");

describe("resized image URLs", () => {
  it("ask the platform's image service for its own images at the width the page needs", () => {
    expect(getThumbnailImage("https://api.example.com/images/products/a.webp")).toBe("https://api.example.com/images/products/a.webp?w=160");
    expect(optimizeImage("https://api.example.com/images/landing/b.webp?w=80", { width: 400 })).toBe(
      "https://api.example.com/images/landing/b.webp?w=400",
    );
  });

  it("leave any other image untouched", () => {
    expect(getThumbnailImage("https://cdn.other.com/products/a.jpg")).toBe("https://cdn.other.com/products/a.jpg");
    expect(optimizeImage("", { width: 80 })).toBe("");
  });

  it("know the service's origin for an early connection", () => {
    expect(mediaOrigin()).toBe("https://api.example.com");
  });
});
