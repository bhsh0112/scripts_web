const STORAGE_KEY = "script_task_history";
const MAX_ITEMS = 50;

/**
 * @typedef {Object} TaskHistoryEntry
 * @property {string} jobId 任务 ID
 * @property {string} moduleId 模块 ID（如 extract-frames）
 * @property {string} moduleName 模块名称
 * @property {string} createdAt ISO 时间
 * @property {string} [message] 简要说明
 * @property {string} [filename] 关联的视频/输入文件名
 */

/**
 * 从 localStorage 读取历史任务列表。
 * @returns {TaskHistoryEntry[]}
 */
const loadHistory = () => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (item) =>
                item &&
                typeof item.jobId === "string" &&
                typeof item.moduleId === "string" &&
                typeof item.moduleName === "string" &&
                typeof item.createdAt === "string"
        );
    } catch (_error) {
        return [];
    }
};

/**
 * 写回 localStorage。
 * @param {TaskHistoryEntry[]} items
 * @returns {void}
 */
const saveHistory = (items) => {
    try {
        const trimmed = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (_error) {
        // 忽略本地存储错误（例如无权限/容量已满）
    }
};

/**
 * 新增一条任务历史记录（去重 + 截断）。
 * @param {TaskHistoryEntry} entry
 * @returns {void}
 */
export const addHistoryEntry = (entry) => {
    if (
        !entry ||
        typeof entry.jobId !== "string" ||
        typeof entry.moduleId !== "string" ||
        typeof entry.moduleName !== "string"
    ) {
        return;
    }
    const list = loadHistory();
    const filtered = list.filter((item) => item.jobId !== entry.jobId);
    filtered.unshift(entry);
    saveHistory(filtered);
};

/**
 * 获取指定模块的历史任务列表（按存储顺序返回，一般为最新在前）。
 * @param {string} moduleId
 * @returns {TaskHistoryEntry[]}
 */
export const getModuleHistory = (moduleId) => {
    if (typeof moduleId !== "string" || moduleId.trim() === "") {
        return [];
    }
    const list = loadHistory();
    return list.filter((item) => item.moduleId === moduleId);
};


