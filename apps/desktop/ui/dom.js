export const el = (id) => document.getElementById(id);

export function textElement(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

export function status(id, value, error = false) {
  const line = el(id);
  line.textContent = value;
  line.dataset.error = String(error);
}
