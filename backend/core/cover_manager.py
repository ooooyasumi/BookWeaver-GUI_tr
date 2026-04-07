"""
封面管理器 - 从 Google Books 搜索封面并替换 EPUB 文件封面
"""

import os
import re
import asyncio
import base64
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

import httpx
from ebooklib import epub, ITEM_IMAGE, ITEM_COVER

from .epub_meta import (
    INDEX_FILE, load_index, save_index, get_or_build_index, _extract_cover_image
)

# ==================== 取消标志 ====================

_cancel_flag = False


def set_cancel_flag(value: bool = True):
    global _cancel_flag
    _cancel_flag = value


def is_cancelled() -> bool:
    return _cancel_flag


def reset_cancel_flag():
    global _cancel_flag
    _cancel_flag = False


# ==================== 输入清洗 ====================

def clean_title(title: str) -> str:
    """清洗书名，去除副标题和括号内容，提高搜索命中率."""
    if not title:
        return ""
    # 去括号内容
    title = re.sub(r"\([^)]*\)", "", title)
    title = re.sub(r"\[[^\]]*\]", "", title)
    # 去副标题（冒号/分号/破折号后内容）
    title = title.split(":")[0].split(";")[0]
    title = re.split(r"\s*[-–—]\s+", title)[0]
    return title.strip()


# ==================== Google Books 搜索 ====================

async def search_google_books(
    title: str, author: str, timeout: float = 15
) -> Optional[str]:
    """从 Google Books API 搜索封面 URL.

    返回最大可用尺寸的封面 URL，或 None。
    """
    clean = clean_title(title)
    if not clean:
        return None

    # 构建搜索词
    q_parts = [f"intitle:{clean}"]
    if author:
        first_author = author.split(",")[0].split("&")[0].split(";")[0].strip()
        if first_author:
            q_parts.append(f"inauthor:{first_author}")

    q = "+".join(q_parts)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://www.googleapis.com/books/v1/volumes",
                params={"q": q, "maxResults": 3},
            )
            if resp.status_code != 200:
                print(f"[Cover] Google Books HTTP {resp.status_code} for '{clean}'")
                return None

            data = resp.json()
            items = data.get("items", [])

            for item in items:
                links = item.get("volumeInfo", {}).get("imageLinks", {})
                if not links:
                    continue

                # 按优先级取最大封面
                for key in ("extraLarge", "large", "medium", "small", "thumbnail"):
                    if key in links:
                        cover_url = links[key]
                        # 尝试获取更大尺寸：替换 zoom 参数
                        cover_url = re.sub(r"zoom=\d", "zoom=3", cover_url)
                        # HTTP → HTTPS
                        cover_url = cover_url.replace("http://", "https://")
                        return cover_url

    except Exception as e:
        print(f"[Cover] Google Books 搜索失败 ({clean}): {e}")

    return None


async def search_openlibrary(
    title: str, author: str, timeout: float = 15
) -> Optional[str]:
    """从 Open Library 搜索封面 URL（兜底方案）."""
    clean = clean_title(title)
    if not clean:
        return None

    try:
        q = clean
        if author:
            first_author = author.split(",")[0].split("&")[0].split(";")[0].strip()
            if first_author:
                q += f" {first_author}"

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://openlibrary.org/search.json",
                params={"q": q, "limit": 3, "fields": "cover_i,edition_key"},
            )
            if resp.status_code != 200:
                return None

            data = resp.json()
            docs = data.get("docs", [])

            for doc in docs:
                cover_id = doc.get("cover_i")
                if cover_id:
                    return f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"

    except Exception as e:
        print(f"[Cover] Open Library 搜索失败 ({clean}): {e}")

    return None


async def search_cover(title: str, author: str) -> Optional[str]:
    """多源搜索封面：Google Books → Open Library."""
    url = await search_google_books(title, author)
    if url:
        return url

    url = await search_openlibrary(title, author)
    if url:
        return url

    return None


# ==================== 下载封面 ====================

async def download_cover(
    url: str, save_path: str, timeout: float = 30
) -> bool:
    """下载封面图片到本地路径."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return False

            content = resp.content
            # 检查最小尺寸（排除占位图）
            if len(content) < 1000:
                return False

            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, "wb") as f:
                f.write(content)
            return True

    except Exception as e:
        print(f"[Cover] 下载封面失败: {e}")
        return False


# ==================== 替换 EPUB 封面 ====================

def replace_epub_cover(epub_path: str, cover_image_path: str) -> Tuple[bool, str]:
    """替换 EPUB 文件中的封面图片.

    返回 (success, error_message)。
    """
    try:
        book = epub.read_epub(epub_path, {"ignore_ncx": True})

        # 读取新封面数据
        with open(cover_image_path, "rb") as f:
            cover_data = f.read()

        # 判断图片类型
        ext = os.path.splitext(cover_image_path)[1].lower()
        media_type_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".gif": "image/gif",
            ".webp": "image/webp",
        }
        media_type = media_type_map.get(ext, "image/jpeg")

        # 使用 ebooklib 的 set_cover 方法
        cover_name = f"cover{ext}"
        book.set_cover(cover_name, cover_data, create_page=False)

        # 写回 EPUB
        epub.write_epub(epub_path, book, {})
        return True, ""

    except Exception as e:
        return False, str(e)


# ==================== 索引操作 ====================

def load_and_save_index(workspace_path, file_path, updates):
    """加载索引，更新指定文件的字段，保存."""
    index = load_index(workspace_path)
    if not index:
        return
    files = index.get("files", {})
    if file_path in files:
        files[file_path].update(updates)
        save_index(workspace_path, index)


def update_file_cover_status(
    workspace_path: str, file_path: str,
    success: bool, error: Optional[str] = None
):
    """更新单个文件的封面状态."""
    updates = {
        "coverUpdated": success,
        "coverUpdatedAt": datetime.now().isoformat() if success else None,
        "coverError": error,
    }
    load_and_save_index(workspace_path, file_path, updates)


# ==================== 状态查询 ====================

def get_cover_status(workspace_path: str) -> Dict[str, Any]:
    """获取封面状态统计."""
    index = get_or_build_index(workspace_path)
    files = index.get("files", {})

    # 加载上传状态
    try:
        from .book_uploader import load_upload_progress
        upload_progress = load_upload_progress(workspace_path)
        uploaded_map = upload_progress.get("uploaded", {})
    except Exception:
        uploaded_map = {}

    not_updated = []
    updated = []

    for fp, meta in files.items():
        entry = {k: v for k, v in meta.items() if not k.startswith("_")}
        entry["uploaded"] = fp in uploaded_map
        if meta.get("coverUpdated") or meta.get("coverError"):
            updated.append(entry)
        else:
            not_updated.append(entry)

    return {
        "total": len(files),
        "notUpdated": len(not_updated),
        "updated": len(updated),
        "notUpdatedFiles": not_updated,
        "updatedFiles": updated,
    }


def get_cover_thumbnails(workspace_path: str, file_paths: List[str]) -> Dict[str, str]:
    """批量提取封面缩略图（base64），用于前端网格展示."""
    thumbnails = {}
    for fp in file_paths:
        if not os.path.exists(fp):
            continue
        try:
            book = epub.read_epub(fp, {"ignore_ncx": True})
            cover_data, cover_type = _extract_cover_image(book)
            if cover_data:
                thumbnails[fp] = {
                    "base64": base64.b64encode(cover_data).decode("utf-8"),
                    "mediaType": cover_type or "image/jpeg",
                }
        except Exception:
            pass
    return thumbnails


# ==================== 批量处理 ====================

BATCH_SIZE = 3
MAX_CONCURRENT = 3


async def process_single_book(
    workspace_path: str,
    file_path: str,
    title: str,
    author: str,
    cache_dir: str,
) -> Dict[str, Any]:
    """处理单本书的封面更新：搜索 → 下载 → 替换 → 清理缓存."""
    result = {
        "filePath": file_path,
        "title": title,
        "success": False,
        "error": None,
    }

    # 1. 搜索封面（Google Books → Open Library）
    cover_url = await search_cover(title, author or "")
    if not cover_url:
        result["error"] = "未找到封面"
        update_file_cover_status(workspace_path, file_path, False, result["error"])
        return result

    # 2. 下载封面到缓存
    safe_name = re.sub(r'[^\w\-.]', '_', os.path.basename(file_path))
    cache_path = os.path.join(cache_dir, f"{safe_name}.jpg")

    if not await download_cover(cover_url, cache_path):
        result["error"] = "封面下载失败"
        update_file_cover_status(workspace_path, file_path, False, result["error"])
        return result

    # 3. 替换 EPUB 封面
    success, error = replace_epub_cover(file_path, cache_path)

    # 4. 清理缓存图片
    try:
        os.remove(cache_path)
    except OSError:
        pass

    if success:
        result["success"] = True
        # 提取新封面 base64 供前端实时更新
        try:
            book = epub.read_epub(file_path, {"ignore_ncx": True})
            cover_data, cover_type = _extract_cover_image(book)
            if cover_data:
                result["coverBase64"] = base64.b64encode(cover_data).decode("utf-8")
                result["coverMediaType"] = cover_type or "image/jpeg"
        except Exception:
            pass
        update_file_cover_status(workspace_path, file_path, True)
    else:
        result["error"] = error
        update_file_cover_status(workspace_path, file_path, False, error)

    return result


async def batch_update_covers(
    workspace_path: str,
    files: List[Dict[str, Any]],
    progress_callback,
):
    """批量更新封面.

    files: [{ filePath, title, author }, ...]
    progress_callback: async callable，发送 SSE 事件
    """
    reset_cancel_flag()

    total = len(files)
    cache_dir = os.path.join(workspace_path, ".bookweaver", "cover_cache")
    os.makedirs(cache_dir, exist_ok=True)

    await progress_callback({
        "type": "start",
        "total": total,
        "success": 0,
        "failed": 0,
    })

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    success_count = 0
    failed_count = 0

    async def process_with_semaphore(file_info):
        nonlocal success_count, failed_count
        if is_cancelled():
            return

        async with semaphore:
            if is_cancelled():
                return

            result = await process_single_book(
                workspace_path,
                file_info["filePath"],
                file_info.get("title") or "",
                file_info.get("author") or "",
                cache_dir,
            )

            if result["success"]:
                success_count += 1
            else:
                failed_count += 1

            await progress_callback({
                "type": "progress",
                "total": total,
                "processed": success_count + failed_count,
                "success": success_count,
                "failed": failed_count,
                "latestResult": result,
            })

    tasks = [process_with_semaphore(f) for f in files]
    await asyncio.gather(*tasks)

    # 清理缓存目录（如果为空）
    try:
        if os.path.exists(cache_dir) and not os.listdir(cache_dir):
            os.rmdir(cache_dir)
    except OSError:
        pass

    await progress_callback({
        "type": "done",
        "total": total,
        "success": success_count,
        "failed": failed_count,
    })
