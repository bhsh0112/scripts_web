"""后端通用工具函数。"""

from __future__ import annotations

import os
import shutil
import tarfile
import uuid
import zipfile
from pathlib import Path
from typing import Iterable, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = Path(__file__).resolve().parent / "storage"
TEMP_DIR = STORAGE_DIR / "tmp"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)


def create_job_dir(module_id: str) -> Tuple[str, Path]:
    """创建模块专属的作业目录。"""

    job_id = uuid.uuid4().hex
    job_dir = STORAGE_DIR / module_id / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_id, job_dir


def save_upload_file(upload_file, destination: Path) -> Path:
    """保存上传文件到目标路径。"""

    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return destination


def extract_archive(archive_path: Path, target_dir: Path) -> Path:
    """解压 zip 或 tar 包到指定目录。返回实际解压目录。"""

    target_dir.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path, "r") as zf:
            zf.extractall(target_dir)
    elif tarfile.is_tarfile(archive_path):
        with tarfile.open(archive_path, "r:*") as tf:
            tf.extractall(target_dir)
    else:
        raise ValueError("仅支持 zip 或 tar 格式的压缩文件")
    return target_dir


def make_zip(source_dir: Path, zip_path: Path) -> Path:
    """将目录压缩为 zip 文件。"""

    zip_path.parent.mkdir(parents=True, exist_ok=True)
    base_name = str(zip_path.with_suffix(""))
    shutil.make_archive(base_name, "zip", source_dir)
    return zip_path


def iter_files(directory: Path) -> Iterable[Path]:
    """遍历目录内的文件。"""

    for root, _, files in os.walk(directory):
        for file_name in files:
            yield Path(root) / file_name


def build_file_url(file_path: Path) -> str:
    """根据文件路径构造静态访问 URL。"""

    relative = file_path.relative_to(STORAGE_DIR)
    return f"/files/{relative.as_posix()}"

