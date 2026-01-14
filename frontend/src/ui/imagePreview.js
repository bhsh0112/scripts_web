import { IMAGE_PREVIEW_OVERLAY_ID } from "../core/constants.js";

let imagePreviewOverlayRef = null;
let imagePreviewImageRef = null;

/**
 * 隐藏图片预览。
 * @returns {void}
 */
export const hideImagePreview = () => {
  if (!(imagePreviewOverlayRef instanceof HTMLDivElement)) {
    return;
  }
  imagePreviewOverlayRef.classList.remove("image-preview--visible");
  document.body.classList.remove("image-preview--locked");
};

/**
 * 确保图片预览浮层已创建。
 * @returns {void}
 */
export const ensureImagePreviewer = () => {
  if (
    imagePreviewOverlayRef instanceof HTMLDivElement &&
    imagePreviewImageRef instanceof HTMLImageElement
  ) {
    return;
  }

  const existing = document.getElementById(IMAGE_PREVIEW_OVERLAY_ID);
  if (existing instanceof HTMLDivElement) {
    imagePreviewOverlayRef = existing;
    imagePreviewImageRef = existing.querySelector("img");
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = IMAGE_PREVIEW_OVERLAY_ID;
  overlay.className = "image-preview";
  overlay.innerHTML = `
    <div class="image-preview__backdrop" data-preview-dismiss></div>
    <div class="image-preview__content" role="dialog" aria-modal="true">
      <button class="image-preview__close" type="button" data-preview-dismiss aria-label="关闭预览">
        &times;
      </button>
      <img class="image-preview__image" src="" alt="" />
    </div>
  `;
  document.body.appendChild(overlay);

  imagePreviewOverlayRef = overlay;
  imagePreviewImageRef = overlay.querySelector(".image-preview__image");

  const dismissElements = overlay.querySelectorAll("[data-preview-dismiss]");
  dismissElements.forEach((element) => {
    element.addEventListener("click", () => {
      hideImagePreview();
    });
  });
};

/**
 * 显示图片预览。
 * @param {string} src 图片地址
 * @param {string} alt 图片描述
 * @returns {void}
 */
export const showImagePreview = (src, alt) => {
  ensureImagePreviewer();
  if (
    !(imagePreviewOverlayRef instanceof HTMLDivElement) ||
    !(imagePreviewImageRef instanceof HTMLImageElement)
  ) {
    return;
  }

  imagePreviewImageRef.src = src;
  imagePreviewImageRef.alt = alt || "图片预览";
  imagePreviewOverlayRef.classList.add("image-preview--visible");
  document.body.classList.add("image-preview--locked");
};

/**
 * 绑定 ESC 关闭预览。
 * @returns {void}
 */
export const bindImagePreviewHotkeys = () => {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideImagePreview();
    }
  });
};

