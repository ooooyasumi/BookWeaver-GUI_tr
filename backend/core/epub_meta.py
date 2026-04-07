"""EPUB 元数据解析与索引.

使用 ebooklib 解析 EPUB 文件的 Dublin Core 元数据。
支持索引缓存以加速重复读取。
"""

import os
import re
import json
import base64
import hashlib
from pathlib import Path
from typing import Optional, List, Dict, Any

from ebooklib import epub
import ebooklib


# ─── 轻量元数据提取（用于索引）──────────────────────────────────────────────

def extract_epub_metadata(file_path: str) -> Dict[str, Any]:
    """
    从 EPUB 文件提取轻量元数据（不含封面和简介，用于索引）.
    """
    result: Dict[str, Any] = {
        "filePath": file_path,
        "fileName": os.path.splitext(os.path.basename(file_path))[0],
        "fileSize": 0,
        "title": None,
        "author": None,
        "language": None,
        "subjects": [],
        "publishYear": None,
        "error": None,
    }

    if not os.path.exists(file_path):
        result["error"] = "文件不存在"
        return result

    result["fileSize"] = os.path.getsize(file_path)

    try:
        book = epub.read_epub(file_path, options={"ignore_ncx": True})

        # 标题
        titles = book.get_metadata("DC", "title")
        if titles:
            result["title"] = titles[0][0]

        # 作者
        creators = book.get_metadata("DC", "creator")
        if creators:
            result["author"] = creators[0][0]

        # 语言
        languages = book.get_metadata("DC", "language")
        if languages:
            result["language"] = languages[0][0]

        # 分类/主题
        subjects = book.get_metadata("DC", "subject")
        if subjects:
            result["subjects"] = [s[0] for s in subjects]

        # 出版年份 — 从 date 字段解析
        dates = book.get_metadata("DC", "date")
        if dates:
            date_str = dates[0][0]
            year_match = re.search(r"(\d{4})", str(date_str))
            if year_match:
                result["publishYear"] = int(year_match.group(1))

    except Exception as e:
        result["error"] = f"解析失败: {str(e)}"

    # 没有标题时用文件名
    if not result["title"]:
        result["title"] = result["fileName"]

    return result


# ─── 详细元数据提取（含封面 base64 和简介，动态按需读取）────────────────────

def extract_epub_detail(file_path: str) -> Dict[str, Any]:
    """
    从 EPUB 文件提取完整详情（含封面图片 base64、书籍简介和基础元数据）.
    按需调用，不缓存，始终从 EPUB 文件实时读取。
    """
    result: Dict[str, Any] = {
        "filePath": file_path,
        "title": None,
        "author": None,
        "language": None,
        "subjects": [],
        "publishYear": None,
        "description": None,
        "coverBase64": None,
        "coverMediaType": None,
        "publisher": None,
        "rights": None,
        "identifier": None,
        "error": None,
    }

    if not os.path.exists(file_path):
        result["error"] = "文件不存在"
        return result

    try:
        book = epub.read_epub(file_path, options={"ignore_ncx": True})

        # 标题
        titles = book.get_metadata("DC", "title")
        if titles:
            result["title"] = titles[0][0]

        # 作者
        creators = book.get_metadata("DC", "creator")
        if creators:
            result["author"] = creators[0][0]

        # 语言
        languages = book.get_metadata("DC", "language")
        if languages:
            result["language"] = languages[0][0]

        # 分类/主题
        subjects = book.get_metadata("DC", "subject")
        if subjects:
            result["subjects"] = [s[0] for s in subjects]

        # 出版年份 — 从 date 字段解析
        dates = book.get_metadata("DC", "date")
        if dates:
            date_str = dates[0][0]
            year_match = re.search(r"(\d{4})", str(date_str))
            if year_match:
                result["publishYear"] = int(year_match.group(1))

        # 简介/描述
        descriptions = book.get_metadata("DC", "description")
        if descriptions:
            result["description"] = descriptions[0][0]

        # 出版商
        publishers = book.get_metadata("DC", "publisher")
        if publishers:
            result["publisher"] = publishers[0][0]

        # 版权
        rights = book.get_metadata("DC", "rights")
        if rights:
            result["rights"] = rights[0][0]

        # 标识符
        identifiers = book.get_metadata("DC", "identifier")
        if identifiers:
            result["identifier"] = identifiers[0][0]

        # 封面图片
        cover_data, cover_type = _extract_cover_image(book)
        if cover_data:
            result["coverBase64"] = base64.b64encode(cover_data).decode("utf-8")
            result["coverMediaType"] = cover_type

    except Exception as e:
        result["error"] = f"解析失败: {str(e)}"

    return result


def _extract_cover_image(book: epub.EpubBook) -> tuple:
    """尝试从 EPUB 提取封面图片，返回 (bytes, media_type) 或 (None, None)."""
    # 方法1: ITEM_COVER 类型
    for item in book.get_items_of_type(ebooklib.ITEM_COVER):
        content = item.get_content()
        if content and len(content) > 100:  # 排除极小的占位图
            return content, item.media_type

    # 方法2: 查找 meta cover 属性指向的 item
    cover_meta = book.get_metadata("OPF", "cover")
    if cover_meta:
        cover_id = cover_meta[0][1].get("content", "") if len(cover_meta[0]) > 1 else cover_meta[0][0]
        if cover_id:
            for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
                if item.get_id() == cover_id:
                    return item.get_content(), item.media_type

    # 方法3: 查找文件名包含 cover 的图片
    for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
        name_lower = item.get_name().lower()
        if "cover" in name_lower:
            content = item.get_content()
            if content and len(content) > 100:
                return content, item.media_type

    return None, None


# ─── 工作区扫描 ──────────────────────────────────────────────────────────────

def scan_workspace_epubs(workspace_path: str) -> List[Dict[str, Any]]:
    """
    扫描工作区目录下的所有 EPUB 文件并返回元数据列表.
    """
    if not workspace_path or not os.path.exists(workspace_path):
        return []

    epub_files: List[Dict[str, Any]] = []

    for root, dirs, files in os.walk(workspace_path):
        # 跳过隐藏目录和 .bookweaver 目录
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for file in files:
            if file.lower().endswith(".epub"):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, workspace_path)

                metadata = extract_epub_metadata(file_path)
                metadata["relativePath"] = relative_path

                epub_files.append(metadata)

    return epub_files


# ─── 索引系统 ────────────────────────────────────────────────────────────────

INDEX_FILE = ".bookweaver/library_index.json"


def _file_fingerprint(file_path: str) -> str:
    """生成文件指纹（大小+修改时间），用于判断是否需要重新解析."""
    stat = os.stat(file_path)
    return f"{stat.st_size}:{stat.st_mtime_ns}"


# ─── 路径转换工具 ─────────────────────────────────────────────────────────────

def _to_rel(workspace_path: str, file_path: str) -> str:
    """绝对路径 → 相对路径（相对于工作区）."""
    if os.path.isabs(file_path):
        return os.path.relpath(file_path, workspace_path)
    return file_path


def _to_abs(workspace_path: str, file_path: str) -> str:
    """相对路径 → 绝对路径."""
    if os.path.isabs(file_path):
        return file_path
    return os.path.normpath(os.path.join(workspace_path, file_path))


def _has_abs_keys(files_dict: dict) -> bool:
    """检测 files 字典的 key 是否为绝对路径（旧格式）."""
    for key in files_dict:
        return os.path.isabs(key)
    return False


def _migrate_index_paths(workspace_path: str, index: Dict[str, Any]) -> Dict[str, Any]:
    """将旧格式（绝对路径 key）索引迁移为新格式（相对路径 key）.

    运行时返回的 index 始终使用绝对路径 key（方便业务代码），
    但文件中存储相对路径（方便跨机器迁移）。
    """
    old_files = index.get("files", {})
    if not _has_abs_keys(old_files):
        # 新格式（相对路径），转为绝对路径用于运行时
        new_files = {}
        for rel_key, meta in old_files.items():
            abs_key = _to_abs(workspace_path, rel_key)
            meta["filePath"] = abs_key
            new_files[abs_key] = meta
        index["files"] = new_files
    else:
        old_workspace = index.get("workspace", "")
        if old_workspace and old_workspace != workspace_path:
            # 旧格式 + 不同机器：用 relativePath 重建绝对路径
            new_files = {}
            for _old_key, meta in old_files.items():
                rel = meta.get("relativePath", "")
                if not rel:
                    # 无 relativePath，尝试从旧路径推导
                    rel = os.path.basename(_old_key)
                abs_key = _to_abs(workspace_path, rel)
                meta["filePath"] = abs_key
                new_files[abs_key] = meta
            index["files"] = new_files
        # else: 旧格式 + 同一机器，key 已经是正确的绝对路径

    index["workspace"] = workspace_path
    return index


def save_index(workspace_path: str, index: Dict[str, Any]):
    """保存索引（绝对路径 key → 相对路径存储）."""
    # 深拷贝 files，转为相对路径存储
    store_files = {}
    for abs_key, meta in index.get("files", {}).items():
        rel_key = _to_rel(workspace_path, abs_key)
        store_meta = dict(meta)
        store_meta["filePath"] = rel_key
        store_files[rel_key] = store_meta

    store_index = {
        "version": index.get("version", "1.0"),
        "workspace": workspace_path,
        "files": store_files,
    }

    index_path = os.path.join(workspace_path, INDEX_FILE)
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(store_index, f, ensure_ascii=False, indent=2)


def build_index(workspace_path: str) -> Dict[str, Any]:
    """
    对工作区所有 EPUB 文件建立索引并写入缓存文件.
    返回索引数据。

    注意：重建索引时会保留已有的元数据状态（metadataUpdated 等）。
    """
    epub_files = scan_workspace_epubs(workspace_path)

    # 尝试加载已有索引，以保留元数据状态
    existing_index = load_index(workspace_path)
    existing_files = existing_index.get("files", {}) if existing_index else {}

    index: Dict[str, Any] = {
        "version": "1.0",
        "workspace": workspace_path,
        "files": {},
    }

    for meta in epub_files:
        fp = meta["filePath"]
        try:
            fingerprint = _file_fingerprint(fp)
        except OSError:
            fingerprint = ""

        # 保留已有的元数据状态
        existing_meta = existing_files.get(fp, {})

        index["files"][fp] = {
            **meta,
            "_fingerprint": fingerprint,
            # 元数据管理状态 - 保留已有值或设置默认值
            "metadataUpdated": existing_meta.get("metadataUpdated", False),
            "metadataUpdatedAt": existing_meta.get("metadataUpdatedAt"),
            "metadataError": existing_meta.get("metadataError"),
            # 封面管理状态
            "coverUpdated": existing_meta.get("coverUpdated", False),
            "coverUpdatedAt": existing_meta.get("coverUpdatedAt"),
            "coverError": existing_meta.get("coverError"),
        }

    # 写入索引文件（使用集中式 save，自动转相对路径）
    save_index(workspace_path, index)

    return index


def load_index(workspace_path: str) -> Optional[Dict[str, Any]]:
    """加载已有索引（如果存在且有效），自动迁移旧格式."""
    index_path = os.path.join(workspace_path, INDEX_FILE)
    if not os.path.exists(index_path):
        return None

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            index = json.load(f)

        # 迁移路径格式（旧绝对路径 → 新相对路径）
        index = _migrate_index_paths(workspace_path, index)
        return index
    except (json.JSONDecodeError, KeyError):
        return None


def get_or_build_index(workspace_path: str) -> Dict[str, Any]:
    """
    获取索引：优先使用缓存，增量更新变化的文件，否则全量重建.
    """
    existing = load_index(workspace_path)

    # 扫描当前实际的 epub 文件
    current_files: Dict[str, str] = {}  # path -> fingerprint
    for root, dirs, files in os.walk(workspace_path):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file in files:
            if file.lower().endswith(".epub"):
                fp = os.path.join(root, file)
                try:
                    current_files[fp] = _file_fingerprint(fp)
                except OSError:
                    pass

    if existing is None:
        # 没有索引，全量构建
        return build_index(workspace_path)

    indexed = existing.get("files", {})
    indexed_paths = set(indexed.keys())
    current_paths = set(current_files.keys())

    # 检查是否有变化
    added = current_paths - indexed_paths
    removed = indexed_paths - current_paths
    changed = set()
    for fp in current_paths & indexed_paths:
        if indexed[fp].get("_fingerprint") != current_files[fp]:
            changed.add(fp)

    if not added and not removed and not changed:
        # 无变化，直接返回
        return existing

    # 增量更新
    # 删除已移除的
    for fp in removed:
        del indexed[fp]

    # 新增和变更的重新解析
    for fp in added | changed:
        relative_path = os.path.relpath(fp, workspace_path)
        meta = extract_epub_metadata(fp)
        meta["relativePath"] = relative_path

        # 保留已有的元数据状态（对于 changed 的文件）
        existing_meta = indexed.get(fp, {})

        indexed[fp] = {
            **meta,
            "_fingerprint": current_files[fp],
            # 保留已有的元数据管理状态
            "metadataUpdated": existing_meta.get("metadataUpdated", False),
            "metadataUpdatedAt": existing_meta.get("metadataUpdatedAt"),
            "metadataError": existing_meta.get("metadataError"),
            # 保留已有的封面管理状态
            "coverUpdated": existing_meta.get("coverUpdated", False),
            "coverUpdatedAt": existing_meta.get("coverUpdatedAt"),
            "coverError": existing_meta.get("coverError"),
        }

    existing["files"] = indexed

    # 写回（使用集中式 save，自动转相对路径）
    save_index(workspace_path, existing)

    return existing


def get_indexed_files(workspace_path: str) -> List[Dict[str, Any]]:
    """从索引获取所有文件的元数据列表."""
    index = get_or_build_index(workspace_path)
    files = []
    for fp, meta in index.get("files", {}).items():
        # 去掉内部字段
        entry = {k: v for k, v in meta.items() if not k.startswith("_")}
        files.append(entry)
    return files


# ─── 文件树构建 ──────────────────────────────────────────────────────────────

def build_file_tree(epub_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """构建文件树结构."""
    root: Dict[str, Any] = {"name": "root", "type": "folder", "children": {}}

    for file in epub_files:
        parts = file.get("relativePath", "").split(os.sep)
        current = root["children"]

        for i, part in enumerate(parts):
            is_file = (i == len(parts) - 1)

            if is_file:
                current[part] = {
                    "name": os.path.splitext(part)[0],
                    "type": "file",
                    "data": file,
                }
            else:
                if part not in current:
                    current[part] = {
                        "name": part,
                        "type": "folder",
                        "children": {},
                    }
                current = current[part]["children"]

    return root


# ─── 分类归组 ────────────────────────────────────────────────────────────────

def categorize_by_subject(epub_files: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """按分类整理书籍."""
    categories: Dict[str, List[Dict[str, Any]]] = {}

    for file in epub_files:
        subjects = file.get("subjects", [])
        if subjects:
            main_subject = subjects[0]
        else:
            main_subject = "未分类"

        if main_subject not in categories:
            categories[main_subject] = []
        categories[main_subject].append(file)

    return dict(sorted(categories.items()))


def categorize_by_year(epub_files: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """按出版年份整理书籍（50年分段）."""
    categories: Dict[str, List[Dict[str, Any]]] = {}

    for file in epub_files:
        year = file.get("publishYear")
        if year is None:
            category = "未知年份"
        else:
            start_year = (year // 50) * 50
            end_year = start_year + 49
            category = f"{start_year}-{end_year}"

        if category not in categories:
            categories[category] = []
        categories[category].append(file)

    def sort_key(k):
        if k == "未知年份":
            return "zzz"
        return k

    return dict(sorted(categories.items(), key=lambda x: sort_key(x[0])))
