"""
元数据更新器 - 使用 LLM 更新书籍元数据
"""

import os
import json
import asyncio
from pathlib import Path
from typing import Optional
from datetime import datetime

from ebooklib import epub

from .llm_harness import call_llm_batch
from .epub_meta import INDEX_FILE, load_index, save_index

# 批量处理的最大书籍数量
BATCH_SIZE = 5
# 并发控制
MAX_CONCURRENT_BATCHES = 2

# 取消标志
_cancel_flag = False


def set_cancel_flag(value: bool = True):
    """设置取消标志"""
    global _cancel_flag
    _cancel_flag = value


def is_cancelled() -> bool:
    """检查是否被取消"""
    return _cancel_flag


def reset_cancel_flag():
    """重置取消标志"""
    global _cancel_flag
    _cancel_flag = False


def update_epub_metadata(file_path: str, metadata: dict) -> tuple:
    """
    更新 EPUB 文件的元数据

    Args:
        file_path: EPUB 文件路径
        metadata: 元数据字典，包含 description, categories, publishYear

    Returns:
        (success, error_message)
    """
    try:
        # 读取 EPUB
        book = epub.read_epub(file_path, {'ignore_ncx': True})

        # 清除已有的元数据（防止累加）
        # ebooklib 的 DC 命名空间 key 是完整的 URI
        dc_ns = 'http://purl.org/dc/elements/1.1/'
        if dc_ns in book.metadata:
            for field in ('description', 'subject', 'date'):
                if field in book.metadata[dc_ns]:
                    book.metadata[dc_ns][field] = []

        # 添加新的元数据
        # 更新简介 (DC:description)
        book.add_metadata('DC', 'description', metadata['description'])

        # 更新分类 (DC:subject) - 去重并限制最多3个
        unique_categories = list(dict.fromkeys(metadata['categories']))[:3]
        for category in unique_categories:
            book.add_metadata('DC', 'subject', category)

        # 更新出版年份 (DC:date) - 只写年份
        book.add_metadata('DC', 'date', str(metadata['publishYear']))

        # 保存 EPUB
        epub.write_epub(file_path, book, {})

        return True, None

    except Exception as e:
        return False, str(e)


def update_file_metadata_status(
    workspace_path: str,
    file_path: str,
    updated: bool,
    error: Optional[str] = None
):
    """更新文件的元数据状态"""
    index_data = load_index(workspace_path)
    if not index_data:
        index_data = {"files": {}, "version": "1.0"}

    if file_path in index_data.get("files", {}):
        index_data["files"][file_path]["metadataUpdated"] = updated
        index_data["files"][file_path]["metadataUpdatedAt"] = datetime.now().isoformat() if updated else None
        index_data["files"][file_path]["metadataError"] = error

    save_index(workspace_path, index_data)


def get_metadata_status(workspace_path: str) -> dict:
    """获取元数据管理状态"""
    index_data = load_index(workspace_path)
    if not index_data:
        index_data = {"files": {}, "version": "1.0"}

    files = index_data.get("files", {})

    # 加载上传状态
    try:
        from .book_uploader import load_upload_progress
        upload_progress = load_upload_progress(workspace_path)
        uploaded_map = upload_progress.get("uploaded", {})
    except Exception:
        uploaded_map = {}

    total = len(files)
    not_updated_files = []
    updated_files = []

    for file_path, file_info in files.items():
        # 返回完整的文件信息
        file_data = {
            "filePath": file_path,
            "title": file_info.get("title"),
            "author": file_info.get("author"),
            "language": file_info.get("language"),
            "publishYear": file_info.get("publishYear"),
            "subjects": file_info.get("subjects", []),
            "fileSize": file_info.get("fileSize"),
            "metadataUpdated": file_info.get("metadataUpdated", False),
            "metadataError": file_info.get("metadataError"),
            "coverUpdated": file_info.get("coverUpdated", False),
            "coverError": file_info.get("coverError"),
            "uploaded": file_info.get("uploaded", file_path in uploaded_map),
            "uploadError": file_info.get("uploadError"),
            "uploadedAt": file_info.get("uploadedAt"),
        }

        if file_info.get("metadataUpdated", False):
            updated_files.append(file_data)
        else:
            not_updated_files.append(file_data)

    return {
        "total": total,
        "notUpdated": len(not_updated_files),
        "updated": len(updated_files),
        "notUpdatedFiles": not_updated_files,
        "updatedFiles": updated_files
    }


async def update_metadata_for_files(
    workspace_path: str,
    files: list,
    config: dict,
    progress_callback=None
) -> dict:
    """
    更新多个文件的元数据

    Args:
        workspace_path: 工作区路径
        files: 要更新的文件列表，每个包含 filePath, title, author
        config: LLM 配置，包含 apiKey, baseUrl, model
        progress_callback: 进度回调函数

    Returns:
        {
            "success": int,
            "failed": int,
            "results": list
        }
    """
    reset_cancel_flag()

    results = []
    success_count = 0
    failed_count = 0

    # 分批处理
    batches = [files[i:i + BATCH_SIZE] for i in range(0, len(files), BATCH_SIZE)]

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)

    async def process_batch(batch: list) -> list:
        async with semaphore:
            if is_cancelled():
                return [{
                    "filePath": f["filePath"],
                    "success": False,
                    "error": "Cancelled"
                } for f in batch]

            # 阶段1: 发送给大模型
            books_info = [{"title": f["title"], "author": f["author"]} for f in batch]

            if progress_callback:
                await progress_callback({
                    "type": "stage",
                    "stage": "sending",
                    "bookTitle": batch[0]["title"] if batch else None
                })

            llm_results = await call_llm_batch(
                books=books_info,
                api_key=config.get("apiKey", ""),
                base_url=config.get("baseUrl", ""),
                model=config.get("model", "gpt-4o-mini"),
                timeout=120.0
            )

            # 阶段2: 接收元数据
            if progress_callback:
                await progress_callback({
                    "type": "stage",
                    "stage": "receiving",
                    "bookTitle": batch[0]["title"] if batch else None
                })

            batch_results = []

            for i, file_info in enumerate(batch):
                if is_cancelled():
                    batch_results.append({
                        "filePath": file_info["filePath"],
                        "title": file_info["title"],
                        "success": False,
                        "error": "Cancelled"
                    })
                    continue

                llm_result = llm_results[i]

                if not llm_result.get("success"):
                    # LLM 返回失败
                    error_msg = llm_result.get("error", "Unknown error")
                    update_file_metadata_status(
                        workspace_path,
                        file_info["filePath"],
                        updated=False,
                        error=error_msg
                    )
                    batch_results.append({
                        "filePath": file_info["filePath"],
                        "title": file_info["title"],
                        "success": False,
                        "error": error_msg
                    })
                    continue

                # 阶段3: 写入 EPUB 文件
                if progress_callback:
                    await progress_callback({
                        "type": "stage",
                        "stage": "writing",
                        "bookTitle": file_info["title"]
                    })

                metadata = llm_result["metadata"]

                # 作者必填校验
                if not metadata.get("author") or not metadata["author"].strip():
                    error = "缺少作者"
                    update_file_metadata_status(workspace_path, file_info["filePath"], updated=False, error=error)
                    batch_results.append({
                        "filePath": file_info["filePath"],
                        "title": file_info["title"],
                        "success": False,
                        "error": error,
                    })
                    continue

                success, error = update_epub_metadata(file_info["filePath"], metadata)

                if success:
                    update_file_metadata_status(
                        workspace_path,
                        file_info["filePath"],
                        updated=True
                    )
                    batch_results.append({
                        "filePath": file_info["filePath"],
                        "title": file_info["title"],
                        "success": True,
                        "metadata": metadata
                    })
                else:
                    update_file_metadata_status(
                        workspace_path,
                        file_info["filePath"],
                        updated=False,
                        error=error
                    )
                    batch_results.append({
                        "filePath": file_info["filePath"],
                        "title": file_info["title"],
                        "success": False,
                        "error": error
                    })

            return batch_results

    # 并发处理所有批次
    tasks = [process_batch(batch) for batch in batches]

    for i, task in enumerate(asyncio.as_completed(tasks)):
        if is_cancelled():
            break

        batch_results = await task
        results.extend(batch_results)

        # 更新统计
        for r in batch_results:
            if r["success"]:
                success_count += 1
            else:
                failed_count += 1

        # 回调进度
        if progress_callback:
            await progress_callback({
                "type": "progress",
                "processed": len(results),
                "total": len(files),
                "success": success_count,
                "failed": failed_count,
                "latestResults": batch_results
            })

    return {
        "success": success_count,
        "failed": failed_count,
        "results": results
    }