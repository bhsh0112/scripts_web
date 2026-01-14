import { YEAR_ELEMENT_ID } from "../core/constants.js";
import { bindEvents } from "./events.js";
import { resolveRoute } from "./router.js";
import { bindImagePreviewHotkeys, ensureImagePreviewer } from "../ui/imagePreview.js";

/**
 * 初始化应用。
 * @returns {void}
 */
export const bootstrap = () => {
  bindEvents();
  resolveRoute();
  window.addEventListener("hashchange", resolveRoute);

  const yearEl = document.getElementById(YEAR_ELEMENT_ID);
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  ensureImagePreviewer();
  bindImagePreviewHotkeys();
};

