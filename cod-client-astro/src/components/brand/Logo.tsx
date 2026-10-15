import darkLogoUrl from "@/images/logo-orestor.png?url";
import lightLogoUrl from "@/images/logo-orestor-light.png?url";

const VARIANT_SRC = {
  dark: darkLogoUrl,
  light: lightLogoUrl,
} as const;

export type LogoVariant = keyof typeof VARIANT_SRC;

/**
 * Orestor wordmark logo ("OreStor." with its green marks, intrinsic 214×40).
 *
 * - `dark`  — purple mark + purple text, for light backgrounds
 * - `light` — purple mark + near-white text, for dark/brand backgrounds
 *
 * Sizing uses inline styles on purpose: Tailwind preflight resets imgs to
 * `height: auto`, which would otherwise drop the height attribute and render
 * the logo at its intrinsic 214px width. Inline `height` + `width: auto`
 * keeps the aspect ratio locked at every render size.
 */
export function Logo({
  variant = "dark",
  height = 28,
  alt = "Orestor",
  className,
}: {
  variant?: LogoVariant;
  height?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={VARIANT_SRC[variant]}
      alt={alt}
      width={Math.round((height * 214) / 40)}
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
      decoding="async"
      draggable={false}
    />
  );
}

export default Logo;
