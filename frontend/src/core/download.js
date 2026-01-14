/**
 * 触发文本内容下载。
 * @param {string} filename
 * @param {string} content
 * @param {string} mime
 * @returns {void}
 */
export const downloadTextFile = (filename, content, mime = "text/plain") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

