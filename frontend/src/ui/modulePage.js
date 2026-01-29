import { MODULES, VIDEO_PARENT_ID, VIDEO_SUBMODULE_IDS } from "../data/modules.js";
import { BACKEND_BASE_URL } from "../core/config.js";
import { render } from "../app/render.js";
import { renderExtractFramesFields, setupExtractFramesForm } from "./forms/extractFrames.js";
import { renderQrcodeFields, setupQrcodeForm } from "./forms/qrcode.js";
import { renderResult, updateStatus } from "../ui/result.js";
import { getModuleHistory, removeHistoryEntry } from "../core/history.js";
import { setupVideoCropperForForm } from "./forms/videoCropper.js";

/**
 * 生成面包屑导航。
 * @param {{name:string}} module
 * @returns {string}
 */
const renderBreadcrumbs = (module) => `
  <nav class="breadcrumbs">
    <a class="breadcrumbs__item" href="#" data-link="home">首页</a>
    <span class="breadcrumbs__item">${module.name}</span>
  </nav>
`;

/**
 * 生成标签区块。
 * @param {{tags:Array<{label:string}>,endpoint?:string}} module
 * @returns {string}
 */
const renderMeta = (module) => {
  const tagItems = module.tags.map((tag) => `<span class="module-detail__meta-item">${tag.label}</span>`).join("");
  const endpointItems = module.endpoint
    ? `
      <span class="module-detail__meta-item">API: ${module.endpoint}</span>
      <span class="module-detail__meta-item">后端: ${BACKEND_BASE_URL}</span>
    `
    : "";
  return `
    <div class="module-detail__meta">
      ${tagItems}
      ${endpointItems}
    </div>
  `;
};

/**
 * 获取视频子模块列表。
 * @returns {Array<{id:string,name:string,summary:string,description:string,tags:Array<{label:string}>,endpoint?:string,externalUrl?:string}>}
 */
const getVideoSubModules = () =>
  VIDEO_SUBMODULE_IDS.map((id) => MODULES.find((item) => item.id === id)).filter(Boolean);

/**
 * 渲染视频子模块卡片。
 * @param {Array<{id:string,name:string,summary:string,tags:Array<{label:string}>,externalUrl?:string}>} modules
 * @returns {string}
 */
const renderVideoSubmoduleCards = (modules) =>
  modules
    .map((module) => {
      const isExternalLink = Boolean(module.externalUrl);
      const actionButton = isExternalLink
        ? `<a class="button" href="${module.externalUrl}" target="_blank" rel="noopener noreferrer">立即使用 →</a>`
        : `<button class="button" data-navigate="${module.id}">立即使用 →</button>`;
      const metaInfo = isExternalLink
        ? `<span>外部链接</span>`
        : `<span>脚本：${module.id.replace(/-/g, "_")}.py</span>`;
      return `
        <article class="module-card" data-module="${module.id}">
          <div class="module-card__header">
            <h3 class="module-card__title">${module.name}</h3>
            <p class="module-card__summary">${module.summary}</p>
            <div class="module-card__tags">
              ${module.tags.map((tag) => `<span class="tag">${tag.label}</span>`).join("")}
            </div>
          </div>
          <div class="module-card__meta">
            ${metaInfo}
          </div>
          <div class="module-card__actions">
            ${actionButton}
          </div>
        </article>
      `;
    })
    .join("");

/**
 * 生成字段输入控件。
 * @param {{id:string,type:string,label:string,required?:boolean,placeholder?:string,description?:string,options?:string[],accept?:string}} field
 * @returns {string}
 */
const renderField = (field) => {
  const baseAttributes = `name="${field.id}" id="${field.id}" ${field.required ? "required" : ""}`;
  const hint = field.description ? `<p class="form__hint">${field.description}</p>` : "";

  switch (field.type) {
    case "textarea":
      return `
        <div class="form__group">
          <label class="form__label" for="${field.id}">${field.label}${field.required ? "<sup>*</sup>" : ""
        }</label>
          <textarea class="textarea" ${baseAttributes} placeholder="${field.placeholder ?? ""}"></textarea>
          ${hint}
        </div>
      `;
    case "select":
      return `
        <div class="form__group">
          <label class="form__label" for="${field.id}">${field.label}${field.required ? "<sup>*</sup>" : ""
        }</label>
          <select class="select" ${baseAttributes}>
            ${(field.options ?? []).map((option) => `<option value="${option}">${option}</option>`).join("")}
          </select>
          ${hint}
        </div>
      `;
    case "file":
      return `
        <div class="form__group">
          <label class="form__label" for="${field.id}">${field.label}${field.required ? "<sup>*</sup>" : ""
        }</label>
          <input class="input" type="file" ${baseAttributes} ${field.accept ? `accept="${field.accept}"` : ""} />
          ${hint}
        </div>
      `;
    default:
      return `
        <div class="form__group">
          <label class="form__label" for="${field.id}">${field.label}${field.required ? "<sup>*</sup>" : ""
        }</label>
          <input class="input" type="${field.type}" ${baseAttributes} placeholder="${field.placeholder ?? ""}" />
          ${hint}
        </div>
      `;
  }
};

/**
 * 渲染模块页面。
 * @param {string} moduleId
 * @returns {void}
 */
export const renderModule = (moduleId) => {
  const target = MODULES.find((item) => item.id === moduleId);
  if (!target) {
    render(
      `<div class="empty">
        <p>未找到对应模块。</p>
        <button class="button button--ghost" data-link="home">返回首页</button>
      </div>`
    );
    return;
  }

  if (target.id === VIDEO_PARENT_ID) {
    const subModules = getVideoSubModules();
    render(`
      ${renderBreadcrumbs(target)}
      <section class="module-detail">
        <header class="module-detail__header">
          <h2 class="module-detail__title">${target.name}</h2>
          <p class="module-detail__desc">${target.description}</p>
          ${renderMeta(target)}
        </header>
        <div class="module-detail__body">
          <h3 class="section__title">子模块</h3>
          <div class="module-grid">${renderVideoSubmoduleCards(subModules)}</div>
        </div>
      </section>
    `);
    return;
  }

  const fields =
    target.id === "extract-frames" || target.id === "mp4-to-gif"
      ? renderExtractFramesFields(target)
      : target.id === "qrcode-generator"
        ? renderQrcodeFields(target)
        : target.fields.map(renderField).join("");

  render(`
    ${renderBreadcrumbs(target)}
    <section class="module-detail">
      <header class="module-detail__header">
        <h2 class="module-detail__title">${target.name}</h2>
        <p class="module-detail__desc">${target.description}</p>
        ${renderMeta(target)}
      </header>
      <div class="module-detail__body">
        <form class="form form-card" data-module-form="${target.id}" autocomplete="off">
          ${fields}
          <div class="form__actions">
            <button class="button" type="submit">提交任务</button>
            <button class="button button--ghost" type="button" data-link="home">取消</button>
          </div>
          <div class="status status--info" hidden data-status-panel>
            <span class="status__text">等待提交</span>
            <span class="status__meta"></span>
          </div>
          <div class="result" hidden data-result-panel>
            <h3 class="result__title" data-result-title>处理结果</h3>
            <p class="result__meta" data-result-meta></p>
            <div class="result__actions" data-result-actions></div>
            <div class="result__previews" hidden data-result-previews></div>
            <div class="result__files" hidden data-result-files>
              <details>
                <summary class="result__files-summary">查看生成文件</summary>
                <ul class="result__file-list" data-result-file-list></ul>
              </details>
            </div>
          </div>
        </form>
        ${target.id === "extract-frames"
      ? `
        <section class="module-detail__history" data-module-history="${target.id}">
          <h3 class="module-detail__history-title">历史任务</h3>
          <p class="module-detail__history-empty" data-history-empty>暂无历史任务。</p>
          <ul class="module-detail__history-list" data-history-list></ul>
        </section>`
      : ""
    }
      </div>
    </section>
  `);

  if (target.id === "extract-frames" || target.id === "mp4-to-gif") {
    const formEl = document.querySelector(`[data-module-form="${target.id}"]`);
    setupExtractFramesForm(formEl);
    if (target.id === "extract-frames") {
      setupExtractFramesHistory(target);
    }
  } else if (target.id === "qrcode-generator") {
    const formEl = document.querySelector(`[data-module-form="${target.id}"]`);
    setupQrcodeForm(formEl);
  }

  // 通用能力：为所有含视频上传的表单挂载“框选裁剪”组件（若无视频输入则自动 no-op）
  const formEl = document.querySelector(`[data-module-form="${target.id}"]`);
  setupVideoCropperForForm(formEl);
};

/**
 * 初始化「视频抽帧」模块的历史任务列表。
 * 使用本地存储的任务摘要，并通过后端 /api/jobs 接口恢复结果详情。
 * @param {{id:string,name:string}} module
 * @returns {void}
 */
const setupExtractFramesHistory = (module) => {
  const panel = document.querySelector(`[data-module-history="${module.id}"]`);
  const form = document.querySelector(`[data-module-form="${module.id}"]`);
  if (!(panel instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
    return;
  }

  const emptyEl = panel.querySelector("[data-history-empty]");
  const listEl = panel.querySelector("[data-history-list]");
  if (!(listEl instanceof HTMLUListElement)) {
    return;
  }

  const entries = getModuleHistory(module.id);
  if (!entries.length) {
    if (emptyEl instanceof HTMLElement) {
      emptyEl.hidden = false;
    }
    panel.hidden = false;
    listEl.innerHTML = "";
    return;
  }

  if (emptyEl instanceof HTMLElement) {
    emptyEl.hidden = true;
  }
  panel.hidden = false;

  const itemsHtml = entries
    .map((entry) => {
      const createdAt = entry.createdAt ? new Date(entry.createdAt) : null;
      const timeText =
        createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.toLocaleString()
          : entry.createdAt || "";
      const safeMessage = entry.message || "";
      const jobId = entry.jobId;
      const filename = entry.filename || "";
      const filenameHtml = filename
        ? `<span class="module-detail__history-filename">文件：${filename}</span>`
        : "";
      return `
        <li class="module-detail__history-item">
          <div class="module-detail__history-meta">
            <span class="module-detail__history-time">${timeText}</span>
            ${filenameHtml}
          </div>
          <div class="module-detail__history-message">${safeMessage}</div>
          <div class="module-detail__history-actions">
            <button
              class="button button--ghost module-detail__history-button"
              type="button"
              data-history-open
              data-job-id="${jobId}"
            >
              查看结果
            </button>
            <button
              class="button button--ghost module-detail__history-button"
              type="button"
              data-history-delete
              data-job-id="${jobId}"
            >
              删除记录
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  listEl.innerHTML = itemsHtml;

  // 点击监听只绑定一次，避免刷新列表时重复绑定导致一次点击触发多次请求
  if (panel.getAttribute("data-history-bound") !== "true") {
    panel.setAttribute("data-history-bound", "true");
    panel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const jobId = target.getAttribute("data-job-id") || "";
      if (!jobId) {
        return;
      }

      if (target.matches("[data-history-delete]")) {
        const deleteBtn = target;
        deleteBtn.disabled = true;
        const deleteUrl = new URL(`/api/jobs/${module.id}/${jobId}`, BACKEND_BASE_URL).toString();
        void (async () => {
          try {
            const response = await fetch(deleteUrl, { method: "DELETE" });
            if (!response.ok) {
              let detail = `删除失败，状态码 ${response.status}`;
              try {
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                  const data = await response.json();
                  if (data && typeof data.detail === "string" && data.detail.trim() !== "") {
                    detail = data.detail.trim();
                  }
                } else {
                  const text = await response.text();
                  if (text && text.trim() !== "") detail = text.trim();
                }
              } catch (_e) {
                // ignore
              }
              throw new Error(detail);
            }
            removeHistoryEntry(module.id, jobId);
            setupExtractFramesHistory(module);
            updateStatus(form, "success", "已删除历史记录", "");
          } catch (error) {
            deleteBtn.disabled = false;
            const errorMessage =
              error instanceof Error ? error.message : "删除失败";
            updateStatus(form, "error", "删除历史记录失败", errorMessage);
          }
        })();
        return;
      }

      if (!target.matches("[data-history-open]")) {
        return;
      }

      updateStatus(form, "info", "正在加载历史任务结果...", `任务编号：${jobId}`);

      const url = new URL(`/api/jobs/${module.id}/${jobId}`, BACKEND_BASE_URL).toString();

      void (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            let detail = `加载失败，状态码 ${response.status}`;
            try {
              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                const data = await response.json();
                if (data && typeof data.detail === "string" && data.detail.trim() !== "") {
                  detail = data.detail.trim();
                } else if (typeof data.message === "string" && data.message.trim() !== "") {
                  detail = data.message.trim();
                }
              } else {
                const text = await response.text();
                if (text && text.trim() !== "") detail = text.trim();
              }
            } catch (_e) {
              // ignore
            }
            throw new Error(detail);
          }

          const payload = await response.json();
          renderResult(form, module, payload);
          updateStatus(form, "success", "已加载历史任务结果", `任务编号：${jobId}`);
        } catch (error) {
          const errorMessage =
            error instanceof TypeError
              ? `无法连接后端服务：${error.message}`
              : error instanceof Error
                ? error.message
                : "未知错误";
          updateStatus(form, "error", "加载历史任务失败", errorMessage);
        }
      })();
    });
  }
};

// 任务完成后刷新历史记录列表（确保新记录显示）
window.addEventListener("module-history-refresh", (event) => {
  const moduleId = event.detail?.moduleId;
  if (!moduleId) return;
  const module = MODULES.find((m) => m.id === moduleId);
  if (!module) return;
  if (!document.querySelector(`[data-module-history="${moduleId}"]`)) return;
  setupExtractFramesHistory(module);
});


