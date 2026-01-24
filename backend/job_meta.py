"""任务元数据读写工具，临时解决方案，后续考虑引入数据库"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from .utils import STORAGE_DIR


def save_job_meta(
    module_id: str,
    job_id: str,
    payload: Mapping[str, Any],
    status: str = "success",
) -> Path:
    """将任务结果保存为 meta.json，便于后续查询/恢复。"""

    job_dir = STORAGE_DIR / module_id / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    meta_path = job_dir / "meta.json"

    data = dict(payload)
    data.setdefault("job_id", job_id)
    data.setdefault("module_id", module_id)
    data.setdefault("status", status)

    created_at = data.get("created_at")
    if not isinstance(created_at, str) or not created_at.strip():
        created_at = datetime.now(timezone.utc).isoformat()
    data["created_at"] = created_at

    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return meta_path


def load_job_meta(module_id: str, job_id: str) -> dict:
    """读取指定任务的 meta.json。"""

    meta_path = STORAGE_DIR / module_id / job_id / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"任务 {module_id}/{job_id} 不存在或已过期")
    with meta_path.open("r", encoding="utf-8") as f:
        return json.load(f)
