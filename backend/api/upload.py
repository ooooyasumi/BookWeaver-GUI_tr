"""
书籍上传 API
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import sys
import os

# 添加 core 目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.book_uploader import (
    get_upload_status,
    upload_books_batch,
    set_cancel_flag,
)

router = APIRouter()


class FileInfo(BaseModel):
    filePath: str
    title: Optional[str] = None
    author: Optional[str] = None


class UploadRequest(BaseModel):
    workspacePath: str
    files: list[FileInfo]
    baseUrl: str
    concurrent: int = 3


@router.get("/status")
async def get_status(workspacePath: str):
    """获取上传状态"""
    try:
        status = get_upload_status(workspacePath)
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
async def start_upload(request: UploadRequest):
    """
    批量上传书籍 (SSE 流)

    使用 asyncio.Queue 实现真正的流式推送。
    """
    queue: asyncio.Queue = asyncio.Queue()

    async def event_generator():
        files = []
        for f in request.files:
            files.append({
                "filePath": f.filePath,
                "title": f.title,
                "author": f.author,
            })

        async def progress_callback(info):
            await queue.put(info)

        async def run_upload():
            try:
                result = await upload_books_batch(
                    workspace_path=request.workspacePath,
                    files=files,
                    base_url=request.baseUrl,
                    progress_callback=progress_callback,
                    max_concurrent=request.concurrent,
                )
                await queue.put({
                    'type': 'done',
                    'success': result['success'],
                    'failed': result['failed'],
                    'skipped': result['skipped'],
                    'results': result['results'],
                })
            except Exception as e:
                await queue.put({'type': 'error', 'message': str(e)})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run_upload())

        try:
            yield f"data: {json.dumps({'type': 'start', 'total': len(files)})}\n\n"

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
        }
    )


@router.post("/cancel")
async def cancel_upload():
    """取消当前上传任务"""
    set_cancel_flag(True)
    return {"success": True, "message": "Cancel signal sent"}
