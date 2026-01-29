"""带进度的目录打包（zip）专用模块。"""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Callable, Optional

from .utils import iter_files


def make_zip_with_progress(
    source_dir: Path,
    zip_path: Path,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> Path:
    """
    将目录压缩为 zip 文件，并支持打包进度回调。
    progress_callback(percent, message) 会在每添加一批文件时被调用，
    percent 为 0.0～100.0，message 为当前状态描述。
    """
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(iter_files(source_dir))
    total = len(files)
    if total == 0:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            pass
        if progress_callback:
            progress_callback(100.0, "打包完成")
        return zip_path

    # 每 N 个文件更新一次进度，避免过于频繁写 meta
    update_every = max(1, min(50, total // 50 or 1))

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, file_path in enumerate(files):
            arcname = file_path.relative_to(source_dir)
            zf.write(file_path, arcname)
            if progress_callback and ((i + 1) % update_every == 0 or i == total - 1):
                pct = (i + 1) / total * 100.0
                progress_callback(pct, f"正在打包… {i + 1}/{total} 个文件")

    if progress_callback:
        progress_callback(100.0, "打包完成")
    return zip_path
