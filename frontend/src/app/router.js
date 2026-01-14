import { renderHome } from "../ui/home.js";
import { renderModule } from "../ui/modulePage.js";

/**
 * 路由解析并渲染对应视图。
 * @returns {void}
 */
export const resolveRoute = () => {
  const hash = window.location.hash;
  if (hash.startsWith("#/module/")) {
    const moduleId = hash.replace("#/module/", "");
    renderModule(moduleId);
  } else {
    renderHome();
  }
};

