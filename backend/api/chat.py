"""AI 对话 API - Plan → Execute → Verify 三阶段 Harness."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import re as _re
import httpx

from openai import OpenAI

router = APIRouter()


def _normalize_base_url(url: str) -> str:
    """规范化 base URL，提高对各种 OpenAI 兼容 API 的支持率.

    处理常见情况：
    - 去除尾部 /
    - 用户粘贴了完整的 chat/completions 路径 → 截断到 /v1
    - URL 末尾没有 /v1 但实际需要 → 不自动加（有些平台不需要）
    """
    url = url.strip().rstrip("/")
    # 去掉用户误粘贴的完整路径后缀
    url = _re.sub(r"/chat/completions/?$", "", url)
    return url


class Message(BaseModel):
    """消息."""
    role: str
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class LLMConfig(BaseModel):
    """LLM 配置."""
    apiKey: str
    model: str = "qwen3-plus"
    baseUrl: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    temperature: float = 0.7
    maxTokens: int = 4000


class ChatRequest(BaseModel):
    """对话请求."""
    message: str
    history: Optional[List[Message]] = None
    config: Optional[LLMConfig] = None
    workspacePath: Optional[str] = None


class TestConfig(BaseModel):
    """测试配置请求."""
    apiKey: str
    baseUrl: str
    model: str


# ─── Prompts ─────────────────────────────────────────────────────────────────

# Phase 1: 让 LLM 把用户意图转换成结构化计划
PLAN_SYSTEM_PROMPT = """你是 BookWeaver 图书助手的任务规划器。

用户会描述他们想要的书籍。你需要把这个需求转换成一个 JSON 格式的搜索计划。

输出格式（只输出 JSON，不要任何其他文字）：

Examples:

User: 推荐20本经典文学
Output: {"type": "search_task", "target_count": 20, "keywords": ["classic literature", "english literature", "victorian literature", "19th century fiction", "literary fiction"], "limit_per_keyword": 10, "language": "en"}

User: 给我找一些悬疑小说
Output: {"type": "search_task", "target_count": 20, "keywords": ["mystery fiction", "detective fiction", "crime fiction", "suspense fiction", "thriller novels"], "limit_per_keyword": 10, "language": "en"}

User: 给我推荐一些科幻小说
Output: {"type": "search_task", "target_count": 20, "keywords": ["science fiction", "sci-fi novels", "speculative fiction", "hard science fiction", "space opera"], "limit_per_keyword": 10, "language": "en"}

User: 想看一些历史书
Output: {"type": "search_task", "target_count": 20, "keywords": ["world history", "ancient history", "modern history", "historical events", "civilization history"], "limit_per_keyword": 10, "language": "en"}

User: 推荐一些哲学书籍
Output: {"type": "search_task", "target_count": 20, "keywords": ["philosophy", "philosophical texts", "western philosophy", "ancient philosophy", "modern philosophy"], "limit_per_keyword": 10, "language": "en"}

User: 给我找爱情小说
Output: {"type": "search_task", "target_count": 20, "keywords": ["romance novels", "love stories", "romantic fiction", "historical romance", "regency romance"], "limit_per_keyword": 10, "language": "en"}

User: 我想看传记
Output: {"type": "search_task", "target_count": 20, "keywords": ["biography", "autobiography", "memoir", "personal narratives", "life stories"], "limit_per_keyword": 10, "language": "en"}

User: 推荐几本科普书
Output: {"type": "search_task", "target_count": 20, "keywords": ["popular science", "scientific literature", "non-fiction science", "science books", "discoveries science"], "limit_per_keyword": 10, "language": "en"}

User: 找一些冒险故事
Output: {"type": "search_task", "target_count": 20, "keywords": ["adventure fiction", "adventure novels", "exploration literature", "sea stories", "travel adventures"], "limit_per_keyword": 10, "language": "en"}

User: 我喜欢奇幻小说
Output: {"type": "search_task", "target_count": 20, "keywords": ["fantasy fiction", "fantasy novels", "high fantasy", "epic fantasy", "dark fantasy"], "limit_per_keyword": 10, "language": "en"}

User: 给我找心理学相关的书
Output: {"type": "search_task", "target_count": 20, "keywords": ["psychology", "psychology books", "cognitive psychology", "human behavior", "mental health"], "limit_per_keyword": 10, "language": "en"}

User: 推荐一些关于战争的书籍
Output: {"type": "search_task", "target_count": 20, "keywords": ["war fiction", "military history", "world war novels", "war stories", "battle narratives"], "limit_per_keyword": 10, "language": "en"}

User: 找经济学相关的书
Output: {"type": "search_task", "target_count": 20, "keywords": ["economics", "political economy", "economic theory", "capitalism", "economic history"], "limit_per_keyword": 10, "language": "en"}

User: 今天天气不错
Output: {"type": "chat"}

User: 你好，在吗？
Output: {"type": "chat"}

Output Format（严格按照此 JSON 结构，不要加任何其他内容）:
{
  "type": "search_task" | "chat",
  "target_count": <目标数量，整数，默认20>,
  "keywords": [<英文关键词1>, <英文关键词2>, ...],
  "limit_per_keyword": <每个关键词搜索数量，整数>,
  "language": "en"
}

Rules:
- target_count：从用户消息中提取目标数量，没有明确数字时默认 20
- keywords：必须用精确的英文主题词，直接对应书籍分类主题，避免口语化表达（如"悬疑小说"→"mystery fiction"而非"mystery novel"）。每类书籍给出5个以上不同角度的关键词，保证召回率。优先用 Gutenberg 目录中常见的分类表达。
- limit_per_keyword：= ceil(target_count / len(keywords)) * 2，确保有足够冗余（因为去重后数量会减少）
- 如果用户只是聊天（问问题、不需要搜书），输出：{"type": "chat"}
- 只输出 JSON，不要任何解释，不要用 markdown 代码块包裹"""

# Phase 3: 生成最终回复
REPLY_SYSTEM_PROMPT = """你是 BookWeaver 图书推荐助手。用纯文字（不使用任何 Markdown 语法）回复用户。"""


async def call_search_api(
    title: str = "",
    author: Optional[str] = None,
    language: str = "en",
    limit: int = 10
) -> List[dict]:
    """调用搜索 API."""
    try:
        url = "http://127.0.0.1:8765/api/books/search"
        params = {
            "title": title,
            "author": author or "",
            "language": language,
            "limit": limit
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=30)
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
    except Exception as e:
        print(f"搜索失败：{e}")
    return []


def make_client(config: LLMConfig) -> OpenAI:
    base_url = _normalize_base_url(config.baseUrl)
    return OpenAI(
        api_key=config.apiKey,
        base_url=base_url,
        timeout=httpx.Timeout(60, connect=10),
    )


def build_history_messages(history: Optional[List[Message]]) -> List[dict]:
    """从历史记录中提取 user/assistant 消息，过滤工具状态消息."""
    msgs = []
    if not history:
        return msgs
    for msg in history:
        if msg.role in ("user", "assistant") and msg.content and msg.content.strip():
            msgs.append({"role": msg.role, "content": msg.content})
    return msgs


@router.post("")
async def chat(request: ChatRequest):
    """
    AI 对话 (SSE) - Plan → Execute → Verify → Reply 四阶段 Harness.

    Phase 1 PLAN:   LLM 分析意图，输出结构化 JSON 计划
    Phase 2 EXECUTE: Backend 驱动循环执行搜索，不依赖 LLM 决策
    Phase 3 VERIFY:  检查是否达标，不足则用兜底关键词补充
    Phase 4 REPLY:   LLM 生成最终自然语言回复
    """
    if not request.config or not request.config.apiKey:
        async def error_response():
            yield f"data: {json.dumps({'type': 'error', 'content': '请先在设置中配置 LLM API Key'})}\n\n"
        return StreamingResponse(error_response(), media_type="text/event-stream")

    client = make_client(request.config)

    async def generate():
        # 后端维护列表状态（去重用）
        list_state: List[dict] = []
        list_id_set: set = set()

        def add_to_list(books: List[dict]) -> List[dict]:
            """去重追加，返回实际新增的书籍."""
            new_books = [b for b in books if b.get("id") not in list_id_set]
            for b in new_books:
                list_state.append(b)
                list_id_set.add(b["id"])
            return new_books

        try:
            # ── Phase 1: PLAN ──────────────────────────────────────────────
            plan_messages = [
                {"role": "system", "content": PLAN_SYSTEM_PROMPT},
                *build_history_messages(request.history),
                {"role": "user", "content": request.message}
            ]

            plan_response = client.chat.completions.create(
                model=request.config.model,
                messages=plan_messages,
                temperature=0.2,  # 低温保证输出稳定 JSON
                max_tokens=800,
                stream=False
            )

            plan_text = (plan_response.choices[0].message.content or "").strip()

            # 移除思考块（如 MiniMax 等模型的 \n<think>...</think> 或 <thinking>...）
            import re
            plan_text = re.sub(r"\n*<think>[\s\S]*?</think>", "", plan_text)
            plan_text = re.sub(r"<thinking>[\s\S]*?</thinking>", "", plan_text, flags=re.IGNORECASE)
            plan_text = plan_text.strip()

            # 解析 JSON 计划（LLM 有时会包裹在代码块里）
            plan_text_clean = plan_text
            if "```" in plan_text:
                m = re.search(r"```(?:json)?\s*([\s\S]+?)```", plan_text)
                if m:
                    plan_text_clean = m.group(1).strip()

            try:
                plan = json.loads(plan_text_clean)
            except Exception:
                # JSON 解析失败 → 当作普通对话处理
                plan = {"type": "chat"}

            # ── 普通对话（不需要搜书）──────────────────────────────────────
            if plan.get("type") != "search_task":
                chat_messages = [
                    {"role": "system", "content": REPLY_SYSTEM_PROMPT},
                    *build_history_messages(request.history),
                    {"role": "user", "content": request.message}
                ]
                chat_response = client.chat.completions.create(
                    model=request.config.model,
                    messages=chat_messages,
                    temperature=request.config.temperature,
                    max_tokens=request.config.maxTokens,
                    stream=True
                )
                for chunk in chat_response:
                    if chunk.choices and chunk.choices[0].delta.content:
                        token = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                return

            # ── Phase 2: EXECUTE ───────────────────────────────────────────
            target_count: int = int(plan.get("target_count", 20))
            keywords: List[str] = plan.get("keywords", ["classic", "fiction"])
            limit_per_keyword: int = int(plan.get("limit_per_keyword", 50))
            language: str = plan.get("language", "en")

            # 先清空旧列表
            yield f"data: {json.dumps({'type': 'clear_results'})}\n\n"
            yield f"data: {json.dumps({'type': 'tool_status', 'content': f'计划搜索 {target_count} 本书，使用 {len(keywords)} 个关键词...'})}\n\n"

            # Backend 驱动循环：逐关键词搜索，直到达标
            for kw in keywords:
                if len(list_state) >= target_count:
                    break  # 已达标，不再搜索

                yield f"data: {json.dumps({'type': 'tool_status', 'content': f'正在搜索：{kw}（已有 {len(list_state)} 本）'})}\n\n"

                results = await call_search_api(
                    title=kw,
                    language=language,
                    limit=limit_per_keyword
                )

                new_books = add_to_list(results)
                if new_books:
                    yield f"data: {json.dumps({'type': 'add_books', 'books': new_books})}\n\n"

            # ── Phase 3: VERIFY + 补充搜索 ─────────────────────────────────
            # 如果还没达标，用兜底关键词继续补
            FALLBACK_KEYWORDS = [
                "literature", "novel", "short stories", "tale", "narrative",
                "poem", "epic", "myth", "legend", "fable",
                "war", "love", "death", "nature", "society",
                "shakespeare", "dickens", "twain", "tolstoy", "austen",
                "wilde", "poe", "hawthorne", "melville", "thoreau",
                "crime", "horror", "comedy", "satire", "allegory"
            ]

            fallback_idx = 0
            max_fallback_rounds = 20  # 最多补充 20 轮

            while len(list_state) < target_count and fallback_idx < len(FALLBACK_KEYWORDS) and max_fallback_rounds > 0:
                max_fallback_rounds -= 1
                kw = FALLBACK_KEYWORDS[fallback_idx]
                fallback_idx += 1

                # 跳过已用过的关键词
                if kw in keywords:
                    continue

                yield f"data: {json.dumps({'type': 'tool_status', 'content': f'补充搜索：{kw}（已有 {len(list_state)} 本，目标 {target_count} 本）'})}\n\n"

                results = await call_search_api(
                    title=kw,
                    language=language,
                    limit=min(limit_per_keyword, target_count - len(list_state) + 50)
                )

                new_books = add_to_list(results)
                if new_books:
                    yield f"data: {json.dumps({'type': 'add_books', 'books': new_books})}\n\n"

            final_count = len(list_state)

            # ── Phase 4: REPLY ─────────────────────────────────────────────
            # 让 LLM 生成一句自然语言总结
            reply_messages = [
                {"role": "system", "content": REPLY_SYSTEM_PROMPT},
                *build_history_messages(request.history),
                {"role": "user", "content": request.message},
                {
                    "role": "system",
                    "content": (
                        f"任务已完成。实际加入列表的书籍数量为 {final_count} 本"
                        f"（目标 {target_count} 本）。"
                        "请用一两句纯文字告知用户结果，不要使用 Markdown。"
                    )
                }
            ]

            reply_response = client.chat.completions.create(
                model=request.config.model,
                messages=reply_messages,
                temperature=0.5,
                max_tokens=200,
                stream=True
            )

            for chunk in reply_response:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': f'AI 对话失败：{str(e)}'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@router.post("/test")
async def test_api(config: TestConfig):
    """测试 API 连接 — 直接用 httpx 发 OpenAI 兼容请求，支持各种提供商."""
    base_url = _normalize_base_url(config.baseUrl)
    url = f"{base_url}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.apiKey}",
    }
    payload = {
        "model": config.model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10)) as client:
            resp = await client.post(url, json=payload, headers=headers)

        body = resp.json() if resp.status_code != 204 else {}

        # 各平台成功判定：有 choices 就算成功
        if resp.status_code == 200 and "choices" in body:
            return {"success": True, "message": "连接成功"}

        # 提取错误信息 — 不同平台格式不同
        err_msg = (
            body.get("error", {}).get("message")  # OpenAI 标准
            or body.get("message")                 # 部分平台
            or body.get("error")                   # 有些平台直接放字符串
            or f"HTTP {resp.status_code}"
        )
        if isinstance(err_msg, dict):
            err_msg = err_msg.get("message", str(err_msg))
        return {"success": False, "error": str(err_msg)}

    except httpx.ConnectError:
        return {"success": False, "error": "无法连接到服务器，请检查 Base URL 是否正确"}
    except httpx.TimeoutException:
        return {"success": False, "error": "连接超时，请检查网络或 Base URL"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/context")
async def get_context():
    return {"history": [], "bookList": []}


@router.delete("/context")
async def clear_context():
    return {"success": True}
