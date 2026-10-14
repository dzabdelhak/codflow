/// <reference types="vitest/globals" />
import { installSubmitGuard } from "./submit-guard";

function makeForm() {
  const form = document.createElement("form");
  form.innerHTML = '<input type="hidden" name="attribution" /><button type="submit">Order</button>';
  document.body.append(form);
  return form;
}

describe("the order button", () => {
  it("locks on the first submit and refuses a second while the first is in flight", () => {
    const doc = document.implementation.createHTMLDocument("guard");
    installSubmitGuard(doc);
    const form = doc.createElement("form");
    form.innerHTML = '<input type="hidden" name="attribution" /><button type="submit">Order</button>';
    doc.body.append(form);
    const seen: boolean[] = [];
    form.addEventListener("submit", (event) => seen.push(event.defaultPrevented));

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(form.dataset.submitting).toBe("1");
    expect(form.querySelector("button")!.disabled).toBe(true);

    const second = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("stays free when another step (OTP, validation) holds the submit back", () => {
    const doc = document.implementation.createHTMLDocument("held");
    installSubmitGuard(doc);
    const form = doc.createElement("form");
    form.innerHTML = '<input type="hidden" name="attribution" /><button type="submit">Order</button>';
    doc.body.append(form);
    form.addEventListener("submit", (event) => event.preventDefault());

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(form.dataset.submitting).toBeUndefined();
    expect(form.querySelector("button")!.disabled).toBe(false);
  });

  it("leaves other forms alone", () => {
    const form = makeForm();
    form.querySelector('input[name="attribution"]')!.remove();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(form.dataset.submitting).toBeUndefined();
  });
});
