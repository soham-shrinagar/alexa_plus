export const $ = (selector) => document.querySelector(selector);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function badge(status) {
  return element(
    "span",
    status.replaceAll("_", " "),
    `badge ${["FAILED", "NEEDS_INPUT", "NEEDS_REPAIR", "SUSPENDED"].includes(status) ? "failed" : status === "ACTIVE" ? "active" : ["DRAFT", "ROLLED_BACK"].includes(status) ? "neutral" : ""}`,
  );
}
const paths = {
  plan: '<path d="M4 4h16v16H4zM8 9h8M8 13h5M8 17h8"/>',
  rehearse: '<path d="M3 12a9 9 0 1 0 3-6M3 3v6h6M12 7v5l3 2"/>',
  saved: '<path d="M5 3h14v18l-7-4-7 4z"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
  connections:
    '<path d="m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9)"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
};
export function decorateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[node.dataset.icon] ?? paths.arrow}</svg>`;
  });
}
export function setNotice(text, error = false) {
  $("#status").textContent = text;
  $("#status").classList.toggle("error", error);
}
export function appendMessage(role, text) {
  $("#conversation").append(element("div", text, `message ${role}`));
  while ($("#conversation").children.length > 16)
    $("#conversation").firstElementChild.remove();
}
export function addTrace(method, detail) {
  const row = element(
    "li",
    `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${method} · ${detail}`,
  );
  $("#tool-trace").append(row);
  while ($("#tool-trace").children.length > 60)
    $("#tool-trace").firstElementChild.remove();
}
