// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ║  Which trackers a page loads, and the head code that loads them.     ║
// ╚══════════════════════════════════════════════════════════════════════╝
export interface PageTrackers {
  meta: string | null;
  tiktok: string | null;
  snap: string | null;
  ga4: string | null;
  googleAds: { id: string; label: string | null } | null;
  consentRequired: boolean;
}

export interface PublicTrackersInput {
  tiktok: string | null;
  snap: string | null;
  ga4: string | null;
  googleAds: { id: string; label: string | null } | null;
  consentRequired: boolean;
}

export const CONSENT_COOKIE = "cod_consent";
export const CONSENT_EVENT = "cod:consent";

export function pageTrackers(metaPixelId: string | null | undefined, trackers: PublicTrackersInput | null | undefined): PageTrackers {
  return {
    meta: metaPixelId || null,
    tiktok: trackers?.tiktok ?? null,
    snap: trackers?.snap ?? null,
    ga4: trackers?.ga4 ?? null,
    googleAds: trackers?.googleAds ?? null,
    consentRequired: trackers?.consentRequired ?? false,
  };
}

export function hasTrackers(t: PageTrackers): boolean {
  return Boolean(t.meta || t.tiktok || t.snap || t.ga4 || t.googleAds);
}

const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function trackersHeadScript(t: PageTrackers): string {
  if (!hasTrackers(t)) return "";
  const gtagIds = [t.ga4, t.googleAds?.id].filter(Boolean) as string[];
  return `window.__codTrackers=${json(t)};
(function(c){
function load(){
if(c.meta){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',c.meta);fbq('track','PageView');}
if(c.tiktok){!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load(c.tiktok);ttq.page();}(window,document,'ttq');}
if(c.snap){(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init',c.snap,{});snaptr('track','PAGE_VIEW');}
var g=${json(gtagIds)};
if(g.length){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(g[0]);document.head.appendChild(s);window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());for(var i=0;i<g.length;i++)gtag('config',g[i]);}
}
if(!c.consentRequired){load();return;}
var m=document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=([^;]*)/);
if(m&&m[1]==='granted'){load();return;}
if(m&&m[1]==='denied')return;
window.addEventListener('${CONSENT_EVENT}',function(e){if(e.detail&&e.detail.granted)load();},{once:true});
})(window.__codTrackers);`;
}
