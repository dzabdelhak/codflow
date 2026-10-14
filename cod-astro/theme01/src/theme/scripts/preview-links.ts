const token = new URLSearchParams(window.location.search).get("preview");

if (token) {
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.origin !== window.location.origin) return;
      const url = new URL(link.href);
      if (url.searchParams.has("preview")) return;
      url.searchParams.set("preview", token);
      link.href = url.toString();
    },
    true,
  );
}
