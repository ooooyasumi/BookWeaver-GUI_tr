"""图书管理 API."""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List
import os
import sys
import json

# 添加 core 目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.epub_meta import (
    get_indexed_files,
    build_file_tree,
    categorize_by_subject,
    categorize_by_year,
    extract_epub_detail,
    build_index,
    get_or_build_index,
    INDEX_FILE,
)
from core.book_uploader import load_upload_progress

router = APIRouter()


def _merge_upload_status(files, workspace_path):
    """将上传状态合并到文件列表中."""
    try:
        progress = load_upload_progress(workspace_path)
        uploaded_map = progress.get("uploaded", {})
    except Exception:
        uploaded_map = {}

    for f in files:
        fp = f.get("filePath", "")
        f["uploaded"] = fp in uploaded_map


@router.get("/files")
async def get_library_files(
    workspacePath: str = Query(..., description="工作区目录路径")
):
    """获取工作区目录下的所有 EPUB 文件（使用索引）."""
    try:
        epub_files = get_indexed_files(workspacePath)
        _merge_upload_status(epub_files, workspacePath)
        file_tree = build_file_tree(epub_files)

        return {
            "files": epub_files,
            "tree": file_tree,
            "total": len(epub_files),
        }
    except Exception as e:
        return {"error": str(e), "files": [], "tree": {}, "total": 0}


@router.get("/filter/subject")
async def filter_by_subject(
    workspacePath: str = Query(..., description="工作区目录路径")
):
    """按分类筛选书籍."""
    try:
        epub_files = get_indexed_files(workspacePath)
        categories = categorize_by_subject(epub_files)

        return {
            "categories": [
                {"name": name, "count": len(books), "books": books}
                for name, books in categories.items()
            ],
            "total": len(epub_files),
        }
    except Exception as e:
        return {"error": str(e), "categories": [], "total": 0}


@router.get("/filter/year")
async def filter_by_year(
    workspacePath: str = Query(..., description="工作区目录路径")
):
    """按出版年份筛选书籍（50年分段）."""
    try:
        epub_files = get_indexed_files(workspacePath)
        categories = categorize_by_year(epub_files)

        return {
            "categories": [
                {"name": name, "count": len(books), "books": books}
                for name, books in categories.items()
            ],
            "total": len(epub_files),
        }
    except Exception as e:
        return {"error": str(e), "categories": [], "total": 0}


@router.get("/detail")
async def get_book_detail(
    filePath: str = Query(..., description="EPUB 文件路径")
):
    """获取单个书籍的详细元数据（含封面 base64 和简介）."""
    try:
        detail = extract_epub_detail(filePath)
        return detail
    except Exception as e:
        return {"error": str(e)}


@router.post("/reindex")
async def reindex_library(
    workspacePath: str = Query(..., description="工作区目录路径")
):
    """强制重建索引."""
    try:
        index = build_index(workspacePath)
        total = len(index.get("files", {}))
        return {"success": True, "total": total}
    except Exception as e:
        return {"success": False, "error": str(e)}


class DeleteRequest(BaseModel):
    workspacePath: str
    filePaths: List[str]


@router.post("/delete")
async def delete_books(request: DeleteRequest):
    """删除指定的 EPUB 文件并从索引中移除."""
    deleted = []
    errors = []

    # 从索引中移除
    index = get_or_build_index(request.workspacePath)
    files = index.get("files", {})

    for fp in request.filePaths:
        # 删除文件
        try:
            if os.path.exists(fp):
                os.remove(fp)
            # 从索引移除
            files.pop(fp, None)
            deleted.append(fp)
        except Exception as e:
            errors.append({"filePath": fp, "error": str(e)})

    # 保存索引
    index_path = os.path.join(request.workspacePath, INDEX_FILE)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    # 同时从上传进度中移除
    try:
        from core.book_uploader import load_upload_progress, save_upload_progress
        progress = load_upload_progress(request.workspacePath)
        for fp in deleted:
            progress.get("uploaded", {}).pop(fp, None)
            progress.get("failed", {}).pop(fp, None)
            progress.get("skipped", {}).pop(fp, None)
        save_upload_progress(request.workspacePath, progress)
    except Exception:
        pass

    return {
        "success": True,
        "deleted": len(deleted),
        "errors": errors,
    }
