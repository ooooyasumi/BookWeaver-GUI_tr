"""配置 API."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class LLMConfig(BaseModel):
    """LLM 配置."""
    apiKey: str = ""
    model: str = "qwen3.5-plus"
    baseUrl: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    temperature: float = 0.7
    maxTokens: int = 2000


class DownloadConfig(BaseModel):
    """下载配置."""
    concurrent: int = 3
    timeout: int = 30


class UploadConfig(BaseModel):
    """上传配置."""
    concurrent: int = 3


class MetadataConfig(BaseModel):
    """元数据更新配置."""
    batchSize: int = 5
    maxConcurrentBatches: int = 2


class Config(BaseModel):
    """应用配置."""
    llm: LLMConfig = LLMConfig()
    download: DownloadConfig = DownloadConfig()
    upload: Optional[UploadConfig] = None
    metadata: Optional[MetadataConfig] = None


# 内存中缓存配置（实际应持久化到工作区）
_cached_config: Optional[Config] = None


@router.get("")
async def get_config():
    """获取配置."""
    if _cached_config is None:
        return Config().model_dump()
    return _cached_config.model_dump()


@router.put("")
async def save_config(config: Config):
    """保存配置."""
    global _cached_config
    _cached_config = config
    return {"success": True}