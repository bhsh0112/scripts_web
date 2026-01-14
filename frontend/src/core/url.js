import { BACKEND_BASE_URL } from "./config.js";

/**
 * 解析模块配置中的 endpoint，得到完整的请求 URL。
 * @param {string} endpoint 相对或绝对地址
 * @returns {string}
 */
export const resolveEndpointUrl = (endpoint) => {
  if (typeof endpoint !== "string" || endpoint.trim() === "") {
    throw new Error("模块未配置有效的接口地址");
  }
  try {
    return new URL(endpoint, BACKEND_BASE_URL).toString();
  } catch (error) {
    throw new Error(
      `无法解析接口地址：${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * 将后端返回的文件路径解析为完整可访问的 URL。
 * @param {string} path 后端响应中的文件路径
 * @returns {string}
 */
export const resolveFileUrl = (path) => {
  if (typeof path !== "string" || path.trim() === "") {
    return path;
  }
  try {
    return new URL(path, BACKEND_BASE_URL).toString();
  } catch (_error) {
    return path;
  }
};

/**
 * 构造强制下载地址（后端以附件形式返回），避免浏览器内联预览。
 * @param {string} path /files/... 形式或绝对 URL
 * @returns {string}
 */
export const buildDownloadUrl = (path) => {
  if (typeof path !== "string" || path.trim() === "") {
    return path;
  }
  let filesPath = "";
  try {
    // 如果是绝对 URL，提取路径部分（URL 对象会自动解码 pathname）
    if (path.startsWith("http://") || path.startsWith("https://")) {
      const u = new URL(path);
      filesPath = u.pathname || "";
    } else {
      // 如果是相对路径，先尝试解码（可能已经被编码过）
      try {
        filesPath = decodeURIComponent(path);
      } catch (_e) {
        // 如果解码失败，说明路径未编码，直接使用
        filesPath = path;
      }
    }
    // 确保以 /files/ 开头
    if (filesPath.includes("/files/")) {
      filesPath = filesPath.slice(filesPath.indexOf("/files/"));
    } else if (!filesPath.startsWith("/files/")) {
      filesPath = `/files/${filesPath}`;
    }
  } catch (_e) {
    // 如果解析失败，尝试直接使用路径
    try {
      filesPath = decodeURIComponent(path);
      if (!filesPath.startsWith("/files/")) {
        filesPath = `/files/${filesPath}`;
      }
    } catch (_e2) {
      filesPath = path.startsWith("/files/") ? path : `/files/${path}`;
    }
  }
  const url = new URL("/api/download", BACKEND_BASE_URL);
  // searchParams.set 会自动编码参数值，确保只编码一次
  url.searchParams.set("path", filesPath);
  return url.toString();
};

/**
 * 构造 GIF 友好预览页地址（用于微信内打开/扫码）。
 * @param {string} path /files/... 形式或绝对 URL
 * @returns {string}
 */
export const buildGifViewUrl = (path) => {
  if (typeof path !== "string" || path.trim() === "") {
    return path;
  }
  let filesPath = "";
  try {
    const u = new URL(path, BACKEND_BASE_URL);
    const pn = u.pathname || "";
    filesPath = pn.includes("/files/") ? pn.slice(pn.indexOf("/files/")) : pn;
  } catch (_e) {
    filesPath = path;
  }
  const url = new URL("/gif", BACKEND_BASE_URL);
  url.searchParams.set("file", filesPath);
  return url.toString();
};

