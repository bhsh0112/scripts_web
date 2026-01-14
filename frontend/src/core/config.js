import { DEFAULT_BACKEND_PORT, LOCAL_SCANNER_PORT } from "./constants.js";

/**
 * 获取后端基础地址。
 * 优先级：全局配置 → 本地存储 → 当前协议与主机的默认端口。
 * @returns {string}
 */
export const getBackendBaseUrl = () => {
  const globalConfig =
    typeof window.APP_CONFIG === "object" && window.APP_CONFIG !== null
      ? window.APP_CONFIG
      : null;
  if (
    globalConfig &&
    typeof globalConfig.backendBaseUrl === "string" &&
    globalConfig.backendBaseUrl.trim() !== ""
  ) {
    return globalConfig.backendBaseUrl.trim();
  }

  try {
    const stored = window.localStorage.getItem("backendBaseUrl");
    if (typeof stored === "string" && stored.trim() !== "") {
      return stored.trim();
    }
  } catch (error) {
    console.warn("读取本地后端地址失败：", error);
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEFAULT_BACKEND_PORT}`;
};

/**
 * 后端基础地址。
 * @type {string}
 */
export const BACKEND_BASE_URL = getBackendBaseUrl();

/**
 * 获取本地扫描助手基础地址。
 * @returns {string}
 */
export const getLocalScannerBaseUrl = () => `http://127.0.0.1:${LOCAL_SCANNER_PORT}`;

