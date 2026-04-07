"""FastAPI 后端入口."""

import sys
import argparse
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api import books, download, chat, config, workspace, library, metadata, upload, cover

app = FastAPI(
    title="BookWeaver API",
    description="Project Gutenberg 书籍下载工具后端 API",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(workspace.router, prefix="/api/workspace", tags=["工作区"])
app.include_router(books.router, prefix="/api/books", tags=["书籍"])
app.include_router(download.router, prefix="/api/download", tags=["下载"])
app.include_router(chat.router, prefix="/api/chat", tags=["对话"])
app.include_router(config.router, prefix="/api/config", tags=["配置"])
app.include_router(library.router, prefix="/api/library", tags=["图书管理"])
app.include_router(metadata.router, prefix="/api/metadata", tags=["元数据管理"])
app.include_router(upload.router, prefix="/api/upload", tags=["书籍上传"])
app.include_router(cover.router, prefix="/api/cover", tags=["封面管理"])


@app.get("/api/health")
async def health_check():
    """健康检查."""
    return {"status": "ok"}


if __name__ == "__main__":
    # 支持命令行参数，用于 PyInstaller 打包后启动
    parser = argparse.ArgumentParser(description="BookWeaver 后端服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址")
    parser.add_argument("--port", type=int, default=8765, help="监听端口")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)