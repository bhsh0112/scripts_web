const VIEW_ROOT_ID = "view-root";

/**
 * 获取主视图容器。
 * @returns {HTMLElement}
 */
export const getViewRoot = () => {
  const el = document.getElementById(VIEW_ROOT_ID);
  if (!el) {
    throw new Error(`未找到视图容器 #${VIEW_ROOT_ID}`);
  }
  return el;
};

/**
 * 渲染指定的 HTML 字符串。
 * @param {string} html
 * @returns {void}
 */
export const render = (html) => {
  getViewRoot().innerHTML = html;
};

