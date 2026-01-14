/**
 * 将秒数格式化为字符串。
 * @param {number} value 秒数
 * @returns {string}
 */
export const formatSeconds = (value) => {
  if (!Number.isFinite(value) || value < 0) {
    return "--";
  }
  return `${value.toFixed(2)}s`;
};

