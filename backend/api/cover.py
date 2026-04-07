"""
封面管理 API
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import json

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


# ─── 状态查询 ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def cover_status(workspacePath: str):
    """获取封面管理状态."""
    if not workspacePath:
        raise HTTPException(status_code=400, detail="缺少 workspacePath 参数")

    status = get_cover_status(workspacePath)

    # 批量提取封面缩略图
    all_files = [f["filePath"] for f in status["notUpdatedFiles"] + status["updatedFiles"]]
    thumbnails = get_cover_thumbnails(workspacePath, all_files)

    # 将缩略图信息合并到文件列表中
    for file_list in (status["notUpdatedFiles"], status["updatedFiles"]):
        for f in file_list:
            fp = f["filePath"]
            if fp in thumbnails:
                f["coverBase64"] = thumbnails[fp]["base64"]
                f["coverMediaType"] = thumbnails[fp]["mediaType"]

    return status


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
