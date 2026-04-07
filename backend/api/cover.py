"""
封面管理 API
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import json
import traceback

from core.cover_manager import (
    get_cover_status,
    get_cover_thumbnails,
    batch_update_covers,
    set_cancel_flag,
    reset_cancel_flag,
)
from core.epub_meta import load_index, INDEX_FILE, get_or_build_index

import os

router = APIRouter()


class CoverUpdateRequest(BaseModel):
    workspacePath: str
    files: List[dict]


class ThumbnailRequest(BaseModel):
    workspacePath: str
    filePaths: List[str]


# ─── 状态查询（轻量，不含缩略图）─────────────────────────────────────────────

@router.get("/status")
async def cover_status(workspacePath: str):
    """获取封面管理状态（不含缩略图，快速返回）."""
    if not workspacePath:
        raise HTTPException(status_code=400, detail="缺少 workspacePath 参数")

    try:
        status = get_cover_status(workspacePath)
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[Cover] get_cover_status 失败: {e}\n{tb}")
        raise HTTPException(
            status_code=500,
            detail=f"获取封面状态失败: {type(e).__name__}: {str(e)}"
        )

    return status


# ─── 缩略图批量提取（独立端点）────────────────────────────────────────────────

@router.post("/thumbnails")
async def cover_thumbnails(request: ThumbnailRequest):
    """批量提取封面缩略图 base64（前端异步调用）."""
    if not request.workspacePath:
        raise HTTPException(status_code=400, detail="缺少 workspacePath 参数")

    try:
        thumbnails = get_cover_thumbnails(request.workspacePath, request.filePaths)
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[Cover] get_cover_thumbnails 失败: {e}\n{tb}")
        raise HTTPException(
            status_code=500,
            detail=f"提取封面缩略图失败: {type(e).__name__}: {str(e)}"
        )

    return {"thumbnails": thumbnails}


# ─── SSE 流式更新 ─────────────────────────────────────────────────────────────

@router.post("/update")
async def cover_update(request: CoverUpdateRequest):
    """SSE 流式更新封面."""
    queue: asyncio.Queue = asyncio.Queue()

    async def progress_callback(info):
        await queue.put(info)

    async def run_update():
        try:
            await batch_update_covers(
                request.workspacePath,
                request.files,
                progress_callback,
            )
        except Exception as e:
            await queue.put({"type": "error", "message": str(e)})
        finally:
            await queue.put(None)  # 哨兵值

    async def event_generator():
        task = asyncio.create_task(run_update())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.CancelledError:
            set_cancel_flag(True)
            task.cancel()
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ─── 取消 ─────────────────────────────────────────────────────────────────────

@router.post("/cancel")
async def cover_cancel():
    """取消封面更新."""
    set_cancel_flag(True)
    return {"success": True}


# ─── 重置状态 ──────────────────────────────────────────────────────────────────

@router.post("/reset-status")
async def cover_reset_status(workspacePath: str, filePath: Optional[str] = None):
    """重置封面更新状态."""
    if not workspacePath:
        raise HTTPException(status_code=400, detail="缺少 workspacePath 参数")

    index = get_or_build_index(workspacePath)
    files = index.get("files", {})

    if filePath:
        # 重置单个文件
        if filePath in files:
            files[filePath]["coverUpdated"] = False
            files[filePath]["coverUpdatedAt"] = None
            files[filePath]["coverError"] = None
    else:
        # 重置全部
        for fp in files:
            files[fp]["coverUpdated"] = False
            files[fp]["coverUpdatedAt"] = None
            files[fp]["coverError"] = None

    # 保存索引
    index_path = os.path.join(workspacePath, INDEX_FILE)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    return {"success": True}
