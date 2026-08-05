export const byId = (id) => document.getElementById(id);

export function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = String(value);
  });
}

export function clickById(id) {
  const target = byId(id);
  if (!target) return false;
  target.click();
  return true;
}
