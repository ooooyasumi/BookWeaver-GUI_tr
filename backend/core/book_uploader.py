"""
书籍上传器 - 将 EPUB 文件上传到云控平台
"""

import os
import re
import json
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

import httpx
from ebooklib import epub, ITEM_IMAGE

from .llm_harness import CATEGORY_MAP

# ==================== 配置常量 ====================

TOKEN = "AEB56C9F5AE17F07"

# 环境列表
ENVIRONMENTS = {
    "frankfurt": "https://backend.toolmatrix.plus",
    "india": "https://ind-backend.toolmatrix.plus",
    "test": "https://test-backend.toolmatrix.plus",
}

MAX_RETRIES = 3
RETRY_DELAY = 2

# 支持的语言
SUPPORTED_LANGUAGES = [
    'Amharic', 'Arabic', 'English', 'French',
    'Portuguese', 'Swahil', 'Hindi',
]

# 语言代码 → 后端语言名称
LANGUAGE_MAP = {
    'am': 'Amharic', 'amh': 'Amharic',
    'ar': 'Arabic', 'ara': 'Arabic',
    'en': 'English', 'eng': 'English',
    'fr': 'French', 'fra': 'French',
    'pt': 'Portuguese', 'por': 'Portuguese',
    'sw': 'Swahil', 'swa': 'Swahil',
    'hi': 'Hindi', 'hin': 'Hindi',
    'es': 'English', 'spa': 'English',
    'de': 'English', 'deu': 'English',
    'it': 'English', 'ita': 'English',
    'ja': 'English', 'jpn': 'English',
    'ko': 'English', 'kor': 'English',
    'zh': 'English', 'zho': 'English',
    'ru': 'English', 'rus': 'English',
}

# 分类名称 → 后端 ID（从 CATEGORY_MAP 反转：CATEGORY_MAP 是 id_str -> name）
CATEGORY_TEXT_TO_ID: Dict[str, int] = {
    name.lower(): int(id_str) for id_str, name in CATEGORY_MAP.items()
}

# 上传进度文件
UPLOAD_PROGRESS_FILE = ".bookweaver/upload_progress.json"

# 取消标志
_cancel_flag = False


def set_cancel_flag(value: bool = True):
    global _cancel_flag
    _cancel_flag = value


def is_cancelled() -> bool:
    return _cancel_flag


def reset_cancel_flag():
    global _cancel_flag
    _cancel_flag = False


# ==================== 分类映射 ====================

def get_category_ids(category_texts: List[str]) -> List[int]:
    """将分类文字列表转换为数字 ID 列表（精确匹配，去重）"""
    ids = []
    for text in category_texts:
        text_lower = text.lower().strip()
        cat_id = CATEGORY_TEXT_TO_ID.get(text_lower)
        if cat_id is not None and cat_id not in ids:
            ids.append(cat_id)
    return ids


# ==================== EPUB 元数据提取 ====================

def extract_upload_metadata(file_path: str) -> Optional[Dict[str, Any]]:
    """
    从 EPUB 提取上传所需的元数据

    Returns:
        元数据字典，解析失败返回 None
    """
    try:
        book = epub.read_epub(file_path, options={"ignore_ncx": True})

        # 标题
        titles = book.get_metadata("DC", "title")
        title = titles[0][0].strip() if titles else ""

        # 作者
        creators = book.get_metadata("DC", "creator")
        author = creators[0][0].strip() if creators else ""

        # 简介
        descriptions = book.get_metadata("DC", "description")
        description = descriptions[0][0].strip() if descriptions else ""

        # 语言
        languages = book.get_metadata("DC", "language")
        lang_code = ""
        if languages:
            lang_code = languages[0][0].split('-')[0].strip().lower()
        language = LANGUAGE_MAP.get(lang_code, 'English')

        # 分类
        subjects = book.get_metadata("DC", "subject")
        all_categories = [s[0].strip() for s in subjects if s and s[0]] if subjects else []

        # 出版社
        publishers = book.get_metadata("DC", "publisher")
        publish_name = publishers[0][0].strip() if publishers else ""

        # 出版年份
        dates = book.get_metadata("DC", "date")
        publish_date = ""
        if dates:
            match = re.match(r'(\d{4})', dates[0][0].strip())
            if match:
                publish_date = match.group(1)

        # ISBN
        identifiers = book.get_metadata("DC", "identifier")
        isbn = ""
        if identifiers:
            raw = identifiers[0][0].replace('-', '').replace(' ', '')
            if len(raw) in [10, 13] and raw[:-1].isdigit():
                isbn = raw

        # 封面
        cover_data = _extract_cover(book)

        return {
            "title": title,
            "author": author,
            "description": description,
            "language": language,
            "all_categories": all_categories,
            "publish_name": publish_name,
            "publish_date": publish_date,
            "isbn": isbn,
            "cover_data": cover_data,
        }

    except Exception as e:
        return None


def _extract_cover(book: epub.EpubBook) -> Optional[Tuple[str, bytes]]:
    """从 EPUB 提取封面图片，返回 (文件名, 数据)"""
    # 方法1: 文件名包含 cover 的图片
    for item in book.get_items_of_type(ITEM_IMAGE):
        if 'cover' in item.get_name().lower() or item.get_id() == 'cover-img':
            content = item.get_content()
            if content and len(content) > 100:
                return (item.get_name(), content)

    # 方法2: 第一个 JPG/PNG 图片
    for item in book.get_items_of_type(ITEM_IMAGE):
        if item.media_type in ['image/jpeg', 'image/jpg', 'image/png']:
            content = item.get_content()
            if content and len(content) > 100:
                return (item.get_name(), content)

    return None


# ==================== 验证 ====================

def validate_upload_metadata(metadata: Dict[str, Any]) -> Tuple[bool, str]:
    """验证必填字段"""
    if not metadata.get("title"):
        return False, "缺少书名"
    if not metadata.get("author"):
        return False, "缺少作者"
    language = metadata.get("language", "")
    if not language:
        return False, "缺少语言"
    if language not in SUPPORTED_LANGUAGES:
        return False, f"语言不支持: {language}"
    return True, ""


# ==================== API 调用 ====================

async def upload_file_to_oss(
    file_path: str,
    base_url: str,
    timeout: float = 60.0
) -> Optional[str]:
    """上传文件到 OSS，返回 accessUrl"""
    url = f"{base_url}/tmms/common/uploadFile?token={TOKEN}"

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                with open(file_path, 'rb') as f:
                    files = {'file': (os.path.basename(file_path), f)}
                    response = await client.post(url, files=files)

                if response.status_code == 200:
                    result = response.json()
                    if result.get('code') == 10000:
                        access_url = result.get('data', {}).get('accessUrl')
                        if access_url:
                            return access_url
                        return None
        except (httpx.TimeoutException, httpx.RequestError):
            pass

        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(RETRY_DELAY)

    return None


async def add_book_to_platform(
    book_data: Dict[str, Any],
    base_url: str,
    timeout: float = 30.0
) -> Tuple[bool, str]:
    """添加书籍到平台，返回 (success, error_msg)"""
    url = f"{base_url}/tmms/pdf/book/addOrUpdateBook?token={TOKEN}"

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, json=book_data)

                if response.status_code == 200:
                    result = response.json()
                    if result.get('code') == 10000:
                        return True, ""
                    else:
                        return False, result.get('msg', 'unknown error')
        except (httpx.TimeoutException, httpx.RequestError) as e:
            if attempt == MAX_RETRIES - 1:
                return False, str(e)

        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(RETRY_DELAY)

    return False, "重试耗尽"


def prepare_book_data(
    metadata: Dict[str, Any],
    cover_url: str,
    book_url: str,
) -> Dict[str, Any]:
    """构造 addOrUpdateBook API 请求体"""
    category_ids = get_category_ids(metadata.get('all_categories', []))

    language = metadata.get('language', 'English')

    book_data = {
        "name": metadata.get('title', ''),
        "author": metadata.get('author', ''),
        "description": metadata.get('description', ''),
        "language": [language],
        "categoryIds": category_ids,
        "bookUrl": book_url,
        "coverUrl": cover_url,
        "fileExt": "epub",
        "publishName": metadata.get('publish_name', ''),
        "publishDate": metadata.get('publish_date', ''),
        "pageCount": 0,
    }

    isbn = metadata.get('isbn', '')
    if isbn:
        if len(isbn) == 10:
            book_data["isbn10"] = isbn
        elif len(isbn) == 13:
            book_data["isbn13"] = isbn

    return book_data


# ==================== 进度持久化 ====================

def load_upload_progress(workspace_path: str) -> Dict[str, Any]:
    """加载上传进度记录"""
    progress_path = os.path.join(workspace_path, UPLOAD_PROGRESS_FILE)
    if os.path.exists(progress_path):
        try:
            with open(progress_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {"uploaded": {}, "failed": {}, "skipped": {}}


def save_upload_progress(workspace_path: str, progress: Dict[str, Any]):
    """保存上传进度记录"""
    progress_path = os.path.join(workspace_path, UPLOAD_PROGRESS_FILE)
    os.makedirs(os.path.dirname(progress_path), exist_ok=True)
    with open(progress_path, 'w', encoding='utf-8') as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def mark_uploaded(workspace_path: str, file_path: str, base_url: str):
    """标记文件已上传"""
    progress = load_upload_progress(workspace_path)
    progress["uploaded"][file_path] = {
        "uploadedAt": datetime.now().isoformat(),
        "baseUrl": base_url,
    }
    # 从 failed 中移除（如果是重新上传成功的）
    progress["failed"].pop(file_path, None)
    save_upload_progress(workspace_path, progress)


def mark_failed(workspace_path: str, file_path: str, error: str):
    """标记文件上传失败"""
    progress = load_upload_progress(workspace_path)
    progress["failed"][file_path] = {
        "error": error,
        "failedAt": datetime.now().isoformat(),
    }
    save_upload_progress(workspace_path, progress)


def mark_skipped(workspace_path: str, file_path: str, reason: str):
    """标记文件被跳过"""
    progress = load_upload_progress(workspace_path)
    progress["skipped"][file_path] = {
        "reason": reason,
        "skippedAt": datetime.now().isoformat(),
    }
    save_upload_progress(workspace_path, progress)


# ==================== 上传状态查询 ====================

def get_upload_status(workspace_path: str) -> Dict[str, Any]:
    """
    获取上传状态

    从索引中筛选 metadataUpdated=true 的文件，
    结合上传进度记录，区分可上传/已上传/失败。
    """
    from .metadata_updater import load_index

    index_data = load_index(workspace_path)
    upload_progress = load_upload_progress(workspace_path)

    uploaded_map = upload_progress.get("uploaded", {})
    failed_map = upload_progress.get("failed", {})
    skipped_map = upload_progress.get("skipped", {})

    can_upload_files = []
    uploaded_files = []
    failed_files = []

    files = index_data.get("files", {})
    for file_path, file_info in files.items():
        # 只处理已更新元数据的文件
        if not file_info.get("metadataUpdated", False):
            continue

        file_data = {
            "filePath": file_path,
            "title": file_info.get("title"),
            "author": file_info.get("author"),
            "language": file_info.get("language"),
            "publishYear": file_info.get("publishYear"),
            "subjects": file_info.get("subjects", []),
            "fileSize": file_info.get("fileSize"),
            "metadataUpdated": file_info.get("metadataUpdated", False),
            "coverUpdated": file_info.get("coverUpdated", False),
            "coverError": file_info.get("coverError"),
        }

        if file_path in uploaded_map:
            file_data["uploadedAt"] = uploaded_map[file_path].get("uploadedAt")
            file_data["uploadBaseUrl"] = uploaded_map[file_path].get("baseUrl")
            uploaded_files.append(file_data)
        elif file_path in failed_map:
            file_data["uploadError"] = failed_map[file_path].get("error")
            file_data["failedAt"] = failed_map[file_path].get("failedAt")
            failed_files.append(file_data)
        else:
            can_upload_files.append(file_data)

    return {
        "total": len(can_upload_files) + len(uploaded_files) + len(failed_files),
        "canUpload": len(can_upload_files),
        "uploaded": len(uploaded_files),
        "failed": len(failed_files),
        "canUploadFiles": can_upload_files,
        "uploadedFiles": uploaded_files,
        "failedFiles": failed_files,
    }


# ==================== 单本书上传 ====================

async def upload_single_book(
    file_path: str,
    base_url: str,
    workspace_path: str,
    progress_callback=None,
) -> Dict[str, Any]:
    """
    上传单本书的完整流程

    Returns:
        { success, error, title, filePath }
    """
    title = os.path.basename(file_path)

    # 1. 提取元数据
    metadata = extract_upload_metadata(file_path)
    if not metadata:
        error = "无法解析 EPUB"
        mark_skipped(workspace_path, file_path, error)
        return {"success": False, "error": error, "title": title, "filePath": file_path, "status": "skipped"}

    title = metadata.get("title") or title

    # 2. 验证必填字段
    valid, error_msg = validate_upload_metadata(metadata)
    if not valid:
        mark_skipped(workspace_path, file_path, error_msg)
        return {"success": False, "error": error_msg, "title": title, "filePath": file_path, "status": "skipped"}

    # 3. 检查封面
    if not metadata.get("cover_data"):
        error = "无法提取封面"
        mark_skipped(workspace_path, file_path, error)
        return {"success": False, "error": error, "title": title, "filePath": file_path, "status": "skipped"}

    # 4. 上传封面
    if progress_callback:
        await progress_callback({
            "type": "stage",
            "stage": "uploading_cover",
            "bookTitle": title,
        })

    # 保存封面到临时文件
    cover_name, cover_bytes = metadata["cover_data"]
    suffix = os.path.splitext(cover_name)[1] or '.jpg'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(cover_bytes)
        cover_tmp_path = tmp.name

    try:
        cover_url = await upload_file_to_oss(cover_tmp_path, base_url)
    finally:
        os.unlink(cover_tmp_path)

    if not cover_url:
        error = "封面上传失败"
        mark_failed(workspace_path, file_path, error)
        return {"success": False, "error": error, "title": title, "filePath": file_path, "status": "failed"}

    if is_cancelled():
        return {"success": False, "error": "Cancelled", "title": title, "filePath": file_path, "status": "cancelled"}

    # 5. 上传 EPUB 文件
    if progress_callback:
        await progress_callback({
            "type": "stage",
            "stage": "uploading_epub",
            "bookTitle": title,
        })

    book_url = await upload_file_to_oss(file_path, base_url, timeout=120.0)
    if not book_url:
        error = "EPUB 上传失败"
        mark_failed(workspace_path, file_path, error)
        return {"success": False, "error": error, "title": title, "filePath": file_path, "status": "failed"}

    if is_cancelled():
        return {"success": False, "error": "Cancelled", "title": title, "filePath": file_path, "status": "cancelled"}

    # 6. 添加书籍到平台
    if progress_callback:
        await progress_callback({
            "type": "stage",
            "stage": "adding_book",
            "bookTitle": title,
        })

    book_data = prepare_book_data(metadata, cover_url, book_url)
    success, error_msg = await add_book_to_platform(book_data, base_url)

    if success:
        mark_uploaded(workspace_path, file_path, base_url)
        return {"success": True, "error": None, "title": title, "filePath": file_path, "status": "uploaded"}
    else:
        mark_failed(workspace_path, file_path, error_msg)
        return {"success": False, "error": error_msg, "title": title, "filePath": file_path, "status": "failed"}


# ==================== 批量上传 ====================

async def upload_books_batch(
    workspace_path: str,
    files: List[Dict[str, Any]],
    base_url: str,
    progress_callback=None,
) -> Dict[str, Any]:
    """
    批量上传书籍（顺序执行）

    Args:
        workspace_path: 工作区路径
        files: 要上传的文件列表
        base_url: 云控平台 API 地址
        progress_callback: 进度回调

    Returns:
        { success, failed, skipped, results }
    """
    reset_cancel_flag()

    results = []
    success_count = 0
    failed_count = 0
    skipped_count = 0

    for i, file_info in enumerate(files):
        if is_cancelled():
            results.append({
                "filePath": file_info["filePath"],
                "title": file_info.get("title", ""),
                "success": False,
                "error": "Cancelled",
                "status": "cancelled",
            })
            failed_count += 1
            continue

        result = await upload_single_book(
            file_path=file_info["filePath"],
            base_url=base_url,
            workspace_path=workspace_path,
            progress_callback=progress_callback,
        )

        results.append(result)

        if result["success"]:
            success_count += 1
        elif result.get("status") == "skipped":
            skipped_count += 1
        else:
            failed_count += 1

        if progress_callback:
            await progress_callback({
                "type": "progress",
                "processed": i + 1,
                "total": len(files),
                "success": success_count,
                "failed": failed_count,
                "skipped": skipped_count,
                "latestResult": result,
            })

    return {
        "success": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "results": results,
    }
