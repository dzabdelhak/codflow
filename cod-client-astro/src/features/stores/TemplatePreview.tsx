import { FONTS } from "../../../../cod-shared/channels/manifests";
import type { ChannelTemplate } from "../../../../cod-shared/channels/templates";

export function TemplatePreview({ template }: { template: ChannelTemplate }) {
  const { brand, sections } = template.preset;
  const shown = sections.filter((section) => section.enabled !== false).slice(0, 4);
  const font = FONTS.find((f) => f.id === brand.fontId);
  return (
    <span
      aria-hidden="true"
      className="block overflow-hidden rounded-lg border border-border"
      style={{ background: brand.bgColor, fontFamily: font?.family }}
    >
      <span className="flex items-center justify-between px-2 py-1.5" style={{ background: brand.primaryColor }}>
        <span className="h-1.5 w-10 rounded-full bg-white/80" />
        <span className="h-1.5 w-6 rounded-full" style={{ background: brand.accentColor }} />
      </span>
      <span className="flex flex-col gap-1.5 p-2">
        {shown.map((section) => {
          const image = section.settings?.heroImage ?? section.settings?.landingBannerImage;
          if (section.type === "hero" || section.type === "banner") {
            return (
              <span
                key={section.type}
                className="flex h-14 flex-col justify-end gap-1 rounded-md bg-cover bg-center p-1.5"
                style={{ backgroundColor: brand.primaryColor, backgroundImage: typeof image === "string" ? `linear-gradient(to top, rgba(0,0,0,.55), transparent), url(${image})` : undefined }}
              >
                <span className="h-1.5 w-20 rounded-full bg-white/90" />
                <span className="h-2.5 w-10 rounded" style={{ background: brand.accentColor }} />
              </span>
            );
          }
          if (section.type === "order_form" || section.type === "price") {
            return <span key={section.type} className="h-4 rounded" style={{ background: section.type === "order_form" ? brand.primaryColor : brand.accentColor }} />;
          }
          return (
            <span key={section.type} className="grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((n) => (
                <span key={n} className="h-5 rounded bg-black/10" />
              ))}
            </span>
          );
        })}
      </span>
      <span className="flex items-center gap-1.5 border-t border-black/5 px-2 py-1 text-[10px] text-black/60">
        {[brand.primaryColor, brand.accentColor, brand.bgColor].map((colour, index) => (
          <span key={index} className="h-3 w-3 rounded-full border border-black/10" style={{ background: colour }} />
        ))}
        <span className="ms-auto">{font?.label}</span>
      </span>
    </span>
  );
}
