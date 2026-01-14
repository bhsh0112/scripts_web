/**
 * 识别操作系统。
 * @returns {"mac"|"win"|"linux"}
 */
export const detectOS = () => {
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "win";
  if (ua.includes("mac")) return "mac";
  return "linux";
};

