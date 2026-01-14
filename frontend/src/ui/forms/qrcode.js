/**
 * 渲染“二维码生成”模块（支持 URL/MP3/视频 三种输入模态）。
 * @returns {string}
 */
export const renderQrcodeFields = () => {
  return `
    <div class="segmented" role="tablist" aria-label="输入类型" data-qrcode-toggle>
      <button class="segmented__item is-active" type="button" role="tab" aria-selected="true" data-mode="url">网站</button>
      <button class="segmented__item" type="button" role="tab" aria-selected="false" data-mode="mp3">MP3</button>
      <button class="segmented__item" type="button" role="tab" aria-selected="false" data-mode="video">视频</button>
    </div>
    <input type="hidden" name="mode" value="url" data-qrcode-mode />

    <div class="form__group" data-url-group>
      <label class="form__label" for="qrcode-target-url">网址链接<sup>*</sup></label>
      <input class="input" type="text" name="target_url" id="qrcode-target-url" placeholder="https://example.com" />
      <p class="form__hint">请输入完整链接（含 http/https），生成网页访问二维码。</p>
    </div>

    <div class="form__group" data-audio-group hidden>
      <label class="form__label" for="qrcode-audio">MP3 文件<sup>*</sup></label>
      <input class="input" type="file" name="audio" id="qrcode-audio" accept="audio/mpeg,.mp3,audio/*" />
      <p class="form__hint">上传 .mp3 后将生成“美化播放页”的二维码，扫码后直接播放。</p>
    </div>

    <div class="form__group" data-video-group hidden>
      <label class="form__label" for="qrcode-video">视频文件<sup>*</sup></label>
      <input class="input" type="file" name="video" id="qrcode-video" accept="video/*" />
      <p class="form__hint">支持常见视频格式（如 mp4/mov/webm），将生成“美化观看页”的二维码。</p>
    </div>
  `;
};

/**
 * 初始化“二维码生成”模块交互。
 * @param {HTMLFormElement | null} form
 * @returns {void}
 */
export const setupQrcodeForm = (form) => {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  const hiddenMode = form.querySelector("[data-qrcode-mode]");
  const toggle = form.querySelector("[data-qrcode-toggle]");
  const urlGroup = form.querySelector("[data-url-group]");
  const audioGroup = form.querySelector("[data-audio-group]");
  const videoGroup = form.querySelector("[data-video-group]");
  if (
    !(hiddenMode instanceof HTMLInputElement) ||
    !toggle ||
    !urlGroup ||
    !audioGroup ||
    !videoGroup
  ) {
    return;
  }
  const updateVisibility = () => {
    const mode =
      hiddenMode.value === "mp3" ? "mp3" : hiddenMode.value === "video" ? "video" : "url";
    const isMp3 = mode === "mp3";
    const isVideo = mode === "video";
    urlGroup.hidden = isMp3 || isVideo;
    audioGroup.hidden = !isMp3;
    videoGroup.hidden = !isVideo;
    // 启用/禁用非当前模态输入，避免视觉或校验干扰
    const urlInput = urlGroup.querySelector("input[name='target_url']");
    const audioInput = audioGroup.querySelector("input[name='audio']");
    const videoInput = videoGroup.querySelector("input[name='video']");
    if (urlInput instanceof HTMLInputElement) {
      urlInput.disabled = isMp3 || isVideo;
      if (isMp3 || isVideo) urlInput.value = "";
    }
    if (audioInput instanceof HTMLInputElement) {
      audioInput.disabled = !isMp3;
      if (!isMp3) audioInput.value = "";
    }
    if (videoInput instanceof HTMLInputElement) {
      videoInput.disabled = !isVideo;
      if (!isVideo) videoInput.value = "";
    }
  };

  toggle.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest("[data-mode]");
    if (!btn) return;
    const attr = btn.getAttribute("data-mode");
    const mode = attr === "mp3" ? "mp3" : attr === "video" ? "video" : "url";
    hiddenMode.value = mode;
    // 选中态
    const items = toggle.querySelectorAll(".segmented__item");
    items.forEach((el) => {
      el.classList.toggle("is-active", el === btn);
      el.setAttribute("aria-selected", el === btn ? "true" : "false");
    });
    updateVisibility();
  });

  // 初始状态
  hiddenMode.value = "url";
  updateVisibility();
};

