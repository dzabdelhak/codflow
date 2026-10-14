// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
const ORDER_FORM = 'input[name="attribution"]';

function orderForm(target: EventTarget | null): HTMLFormElement | null {
  return target instanceof HTMLFormElement && target.querySelector(ORDER_FORM) ? target : null;
}

export function installSubmitGuard(doc: Document = document): void {
  doc.addEventListener(
    "submit",
    (event) => {
      const form = orderForm(event.target);
      if (form?.dataset.submitting === "1") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  doc.addEventListener("submit", (event) => {
    const form = orderForm(event.target);
    if (!form || event.defaultPrevented) return;
    form.dataset.submitting = "1";
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])').forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });
  });
  doc.defaultView?.addEventListener("pageshow", (event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    doc.querySelectorAll<HTMLFormElement>("form[data-submitting]").forEach((form) => {
      delete form.dataset.submitting;
      form.querySelectorAll<HTMLButtonElement>("button[aria-busy]").forEach((button) => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    });
  });
}

if (typeof document !== "undefined") installSubmitGuard();
