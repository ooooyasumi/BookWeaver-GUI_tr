"""
LLM Harness - 大模型调用封装，用于获取书籍元数据
"""

import json
import httpx
from typing import Optional

# 分类映射：数字 -> 分类名称
CATEGORY_MAP = {
    "1": "Arts",
    "2": "Astronomy",
    "3": "Biography & Autobiography",
    "4": "Biology and other natural sciences",
    "5": "Business & Economics",
    "6": "Chemistry",
    "7": "Comics & Graphic Novels",
    "8": "Computers",
    "9": "Children's Books",
    "10": "Crime, Thrillers & Mystery",
    "11": "Cookbooks, Food & Wine",
    "12": "Earth Sciences",
    "13": "Engineering",
    "14": "Erotica",
    "15": "Education Studies & Teaching",
    "16": "Fiction",
    "17": "Fantasy",
    "18": "History",
    "19": "Housekeeping & Leisure",
    "20": "Jurisprudence & Law",
    "21": "Languages",
    "22": "Linguistics",
    "23": "Mathematics",
    "24": "Medicine",
    "25": "Nature, Animals & Pets",
    "26": "Others",
    "27": "Physics",
    "28": "Poetry",
    "29": "Psychology",
    "30": "Reference",
    "31": "Religion & Spirituality",
    "32": "Romance",
    "33": "Science Fiction",
    "34": "Science (General)",
    "35": "Sports, Hobbies & Games",
    "36": "Society, Politics & Philosophy",
    "37": "Self-Help, Relationships & Lifestyle",
    "38": "Travel",
    "39": "Technique"
}

# 有效的分类数字列表
VALID_CATEGORY_IDS = list(CATEGORY_MAP.keys())

# 分类列表文本（用于 prompt）
CATEGORY_LIST_TEXT = "\n".join([f"    {k}: \"{v}\"" for k, v in CATEGORY_MAP.items()])

PROMPT_TEMPLATE = """You are a book metadata expert. Given the book title and author, provide structured metadata.

IMPORTANT: You must respond in valid JSON format only. No other text before or after the JSON.

Book Title: {title}
Author: {author}

Examples:

Input: Title: "Pride and Prejudice", Author: "Jane Austen"
Output: {{"success": true, "error": null, "metadata": {{"description": "Pride and Prejudice, a satirical novel first published in 1813, follows the turbulent relationship between Elizabeth Bennet, a witty and intelligent young woman, and the proud Fitzwilliam Darcy. Set in early 19th-century England, the story explores themes of love, reputation, and social class. Through a series of misunderstandings and personal growth, the characters learn that first impressions can be deceiving and that true happiness requires overcoming prejudice and personal pride.", "categories": [16, 32], "publishYear": 1813}}}}


Input: Title: "The Republic", Author: "Plato"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Republic is a Socratic dialogue written by Plato around 375 BC. It concerns justice, the order and character of the just city-state, and the just man. Plato uses the conversation with Socrates to explore the nature of reality, the theory of Forms, the epistemology of knowledge, the philosophy of education, and the ideal governance of society.", "categories": [36, 31], "publishYear": -375}}}}


Input: Title: "1984", Author: "George Orwell"
Output: {{"success": true, "error": null, "metadata": {{"description": "1984 is a dystopian social science fiction novel published in 1949. Set in a totalitarian society under constant surveillance, it follows Winston Smith, a low-ranking party member who dreams of rebellion against the omnipresent state. The novel explores the dangers of totalitarianism, mass surveillance, and the manipulation of truth and history.", "categories": [33, 16], "publishYear": 1949}}}}


Input: Title: "A Brief History of Time", Author: "Stephen Hawking"
Output: {{"success": true, "error": null, "metadata": {{"description": "A Brief History of Time is a popular science book published in 1988 by physicist Stephen Hawking. It explains concepts like the Big Bang, black holes, light cones, and the universe to non-specialist readers. Hawking discusses fundamental questions about the nature of the cosmos, the existence of God, and the future of humanity.", "categories": [34, 2], "publishYear": 1988}}}}


Input: Title: "The Art of War", Author: "Sun Tzu"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Art of War is an ancient Chinese military treatise written by Sun Tzu in the 5th century BC. It is a foundational work on military strategy and tactics, influencing both Eastern and Western military thinking, business tactics, and legal strategy. The text emphasizes strategy, tactics, and manipulation as essential tools for success.", "categories": [5, 18], "publishYear": -500}}}}


Input: Title: "The Diary of a Young Girl", Author: "Anne Frank"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Diary of a Young Girl is a book of entries from the diary of Anne Frank, a Jewish girl who went into hiding with her family during the Nazi occupation of the Netherlands. Documenting her life from 1942 to 1944, it provides a personal account of the Holocaust and remains one of the most widely read works about wartime experiences.", "categories": [3, 18], "publishYear": 1947}}}}


Input: Title: "The Hobbit", Author: "J.R.R. Tolkien"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Hobbit is a fantasy novel published in 1937, following the quest of Bilbo Baggins, a comfort-loving hobbit who embarks on an adventure with a group of dwarves. Set in Tolkien's fictional Middle-earth, the story combines adventure, mythology, and heroic quest themes. It serves as a prelude to The Lord of the Rings.", "categories": [17, 16], "publishYear": 1937}}}}


Input: Title: "Sapiens: A Brief History of Humankind", Author: "Yuval Noah Harari"
Output: {{"success": true, "error": null, "metadata": {{"description": "Sapiens is a non-fiction book that traces the history of humankind from the Stone Age to the present, examining how Homo sapiens came to dominate the planet. It explores the Cognitive Revolution, the Agricultural Revolution, and the Scientific Revolution, discussing the role of myths, religions, and nations in shaping human societies.", "categories": [18, 36], "publishYear": 2011}}}}


Input: Title: "Thinking, Fast and Slow", Author: "Daniel Kahneman"
Output: {{"success": true, "error": null, "metadata": {{"description": "Thinking, Fast and Slow is a 2011 book by Nobel laureate Daniel Kahneman that explores the two systems that drive the way we think: fast, intuitive thinking and slow, deliberate thinking. It examines human cognition, behavioral economics, rationality, and the systematic errors in human judgment.", "categories": [29, 5], "publishYear": 2011}}}}


Input: Title: "The Origin of Species", Author: "Charles Darwin"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Origin of Species is a seminal work of scientific literature published in 1859 by Charles Darwin. It presents the theory of evolution by natural selection, explaining how species adapt and evolve over time. The book fundamentally changed our understanding of life on Earth and remains the foundation of modern evolutionary biology.", "categories": [4, 34], "publishYear": 1859}}}}


Input: Title: "The Road to Serfdom", Author: "Friedrich Hayek"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Road to Serfdom is a book written by economist Friedrich Hayek in 1944, arguing that reliance on central planning leads to the loss of freedom and eventual totalitarian regimes. It is a classic critique of socialism and a defense of classical liberalism and the free market.", "categories": [5, 36], "publishYear": 1944}}}}


Input: Title: "Meditations", Author: "Marcus Aurelius"
Output: {{"success": true, "error": null, "metadata": {{"description": "Meditations is a series of personal writings by Roman Emperor Marcus Aurelius, written in Greek during his military campaigns. The work represents Stoic philosophy in practice, offering guidance on self-discipline, resilience, and living in accordance with reason and nature.", "categories": [31, 36], "publishYear": 180}}}}


Input: Title: "The Great Gatsby", Author: "F. Scott Fitzgerald"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Great Gatsby is a novel published in 1925, set in the Jazz Age on Long Island. It follows the mysterious millionaire Jay Gatsby and his obsessive pursuit of Daisy Buchanan. Through the tragic结局, Fitzgerald explores themes of wealth, love, idealism, and the American Dream.", "categories": [16], "publishYear": 1925}}}}


Input: Title: "The Odyssey", Author: "Homer"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Odyssey is an ancient Greek epic poem attributed to Homer, composed around the 8th century BC. It follows the Greek hero Odysseus on his ten-year journey home after the Trojan War. The poem is a cornerstone of Western literature, dealing with themes of homecoming, heroism, and divine intervention.", "categories": [28, 16], "publishYear": -800}}}}


Input: Title: "The Prince", Author: "Niccolò Machiavelli"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Prince is a political treatise written by Niccolò Machiavelli in 1513, offering advice on acquiring and maintaining power. It is famous for its pragmatic approach to politics, advocating that rulers should be willing to act immorally if necessary. The work is foundational in Western political philosophy.", "categories": [36, 20], "publishYear": 1532}}}}


Input: Title: "To Kill a Mockingbird", Author: "Harper Lee"
Output: {{"success": true, "error": null, "metadata": {{"description": "To Kill a Mockingbird is a novel published in 1960, set in the American South during the Great Depression. Through the eyes of young Scout Finch, it follows her father Atticus Finch, a lawyer defending a Black man falsely accused of rape. The novel addresses racial injustice, moral courage, and the loss of innocence.", "categories": [16], "publishYear": 1960}}}}


Input: Title: "The Selfish Gene", Author: "Richard Dawkins"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Selfish Gene is a popular science book published in 1976 by Richard Dawkins. It presents the gene-centered view of evolution, arguing that genes are the primary unit of selection in evolution. The book explains how genes shape behavior, cooperation, and altruism in living organisms.", "categories": [4, 34], "publishYear": 1976}}}}


Input: Title: "Crime and Punishment", Author: "Fyodor Dostoevsky"
Output: {{"success": true, "error": null, "metadata": {{"description": "Crime and Punishment is a novel published in 1866 by Fyodor Dostoevsky, exploring the psychological and moral struggles of Rodion Raskolnikov, a destitute former student in Saint Petersburg who commits murder and wrestles with his conscience. The book delves deeply into guilt, suffering, redemption, and the nature of justice.", "categories": [16, 29], "publishYear": 1866}}}}


Input: Title: "The Joy of Cooking", Author: "Irma S. Rombauer"
Output: {{"success": true, "error": null, "metadata": {{"description": "The Joy of Cooking is a bestselling cookbook first published in 1936 by Irma S. Rombauer. It contains recipes, cooking techniques, and kitchen tips. Originally a self-published book, it became one of the most widely read cookbooks in the United States, undergoing multiple revisions and editions.", "categories": [11], "publishYear": 1936}}}}


Input: Title: "On the Origin of Species", Author: "Charles Darwin"
Output: {{"success": true, "error": null, "metadata": {{"description": "On the Origin of Species is a seminal work of scientific literature published in 1859 by Charles Darwin. It presents the theory of evolution by natural selection, explaining how species adapt and evolve over generations. This foundational text transformed biology and our understanding of life on Earth.", "categories": [4, 34], "publishYear": 1859}}}}


Input: Title: "Unknown Book XYZ", Author: "Nonexistent Author"
Output: {{"success": false, "error": "Cannot find reliable information about this book", "metadata": null}}

Respond with this exact JSON structure:
{{
  "success": true or false,
  "error": null or "reason if failed to find the book",
  "metadata": {{
    "description": "A 150-300 word English description of the book",
    "categories": [1, 2],
    "publishYear": 1813 or negative year for BC
  }}
}}

Rules:
1. description MUST be 150-300 words in English
2. categories MUST be 1-3 NUMBERS from this list (pick the MOST SPECIFIC categories, avoid 34 "Science (General)" when a specific science exists):
{categories}
3. publishYear MUST be the ORIGINAL/FIRST publication year (4-digit integer or negative for BC), not reprint dates
4. If you cannot find reliable information about this book, set success to false and provide an error reason
5. Do not make up information - only provide what you can verify
6. Output ONLY the JSON, no markdown code blocks, no explanations
7. Category selection guide: Fiction novels → [16] or genre-specific [17 Fantasy/33 SciFi/32 Romance/10 Crime]; Non-fiction → pick the specific discipline [3 Biography/4 Biology/18 History/31 Religion/36 Philosophy/29 Psychology etc.]; General social/political → [36]; Literature/Classics with no specific genre → [16]; Science books → specific science [2 Astronomy/6 Chemistry/27 Physics/4 Biology] not [34]"""

BATCH_PROMPT_TEMPLATE = """You are a book metadata expert. Given multiple book titles and authors, provide structured metadata for each.

IMPORTANT: You must respond in valid JSON array format only. No other text before or after the JSON.

Books to process:
{books}

Examples:

Books: [{"index": 0, "title": "Pride and Prejudice", "author": "Jane Austen"}, {"index": 1, "title": "The Republic", "author": "Plato"}, {"index": 2, "title": "A Brief History of Time", "author": "Stephen Hawking"}, {"index": 3, "title": "The Hobbit", "author": "J.R.R. Tolkien"}, {"index": 4, "title": "Meditations", "author": "Marcus Aurelius"}]
Output: [{{"index": 0, "success": true, "error": null, "metadata": {{"description": "Pride and Prejudice, a satirical novel first published in 1813, follows the turbulent relationship between Elizabeth Bennet, a witty and intelligent young woman, and the proud Fitzwilliam Darcy. Set in early 19th-century England, the story explores themes of love, reputation, and social class.", "categories": [16, 32], "publishYear": 1813}}}, {{"index": 1, "success": true, "error": null, "metadata": {{"description": "The Republic is a Socratic dialogue written by Plato around 375 BC. It concerns justice, the order and character of the just city-state, and the just man. Through a conversation with Socrates, it explores the nature of reality, the theory of Forms, and ideal governance.", "categories": [36, 31], "publishYear": -375}}}, {{"index": 2, "success": true, "error": null, "metadata": {{"description": "A Brief History of Time is a popular science book published in 1988 by physicist Stephen Hawking. It explains concepts like the Big Bang, black holes, and the universe to non-specialist readers.", "categories": [34, 2], "publishYear": 1988}}}, {{"index": 3, "success": true, "error": null, "metadata": {{"description": "The Hobbit is a fantasy novel published in 1937, following Bilbo Baggins on his quest with a group of dwarves. Set in Tolkien's fictional Middle-earth, it combines adventure, mythology, and heroic quest themes.", "categories": [17, 16], "publishYear": 1937}}}, {{"index": 4, "success": true, "error": null, "metadata": {{"description": "Meditations is a series of personal writings by Roman Emperor Marcus Aurelius, written in Greek during his military campaigns. The work represents Stoic philosophy in practice.", "categories": [31, 36], "publishYear": 180}}}]

Respond with a JSON array where each item has:
{{
  "index": the book index (0-based),
  "success": true or false,
  "error": null or "reason if failed",
  "metadata": {{
    "description": "150-300 word English description",
    "categories": [1, 2],
    "publishYear": 1813 or negative year for BC
  }}
}}

Rules:
1. description MUST be 150-300 words in English
2. categories MUST be 1-3 NUMBERS from this list (pick the MOST SPECIFIC categories, avoid 34 "Science (General)" when a specific science exists):
{categories}
3. publishYear MUST be the ORIGINAL/FIRST publication year (4-digit integer or negative for BC), not reprint dates
4. If you cannot find reliable information, set success to false
5. Return results in the same order as input (match by index field)
6. Output ONLY the JSON array, no markdown code blocks, no explanations
7. Category selection guide: Fiction novels → [16] or genre-specific [17 Fantasy/33 SciFi/32 Romance/10 Crime]; Non-fiction → pick the specific discipline [3 Biography/4 Biology/18 History/31 Religion/36 Philosophy/29 Psychology etc.]; General social/political → [36]; Literature/Classics with no specific genre → [16]; Science books → specific science [2 Astronomy/6 Chemistry/27 Physics/4 Biology] not [34]"""


def convert_category_ids_to_names(category_ids: list) -> list[str]:
    """将分类数字转换为分类名称"""
    result = []
    for id in category_ids:
        # 处理字符串或数字类型的 id
        id_str = str(id)
        if id_str in CATEGORY_MAP:
            result.append(CATEGORY_MAP[id_str])
        else:
            # 如果不在映射中，使用 "Others"
            result.append("Others")
    return result


def build_single_prompt(title: str, author: str) -> str:
    """构建单本书的 prompt"""
    return PROMPT_TEMPLATE.format(
        title=title,
        author=author,
        categories=CATEGORY_LIST_TEXT
    )


def build_batch_prompt(books: list[dict]) -> str:
    """构建批量处理的 prompt"""
    books_text = ""
    for i, book in enumerate(books):
        books_text += f'{i}. Title: "{book["title"]}", Author: "{book["author"]}"\n'

    return BATCH_PROMPT_TEMPLATE.format(
        books=books_text,
        categories=CATEGORY_LIST_TEXT
    )


def validate_metadata(metadata: dict) -> tuple[bool, Optional[str]]:
    """验证元数据字段"""
    # 验证简介
    description = metadata.get("description", "")
    if not isinstance(description, str):
        return False, "description must be a string"

    word_count = len(description.split())
    if word_count < 150 or word_count > 300:
        return False, f"description word count must be 150-300, got {word_count}"

    # 验证分类（现在是数字，限制 1-3 个）
    categories = metadata.get("categories", [])
    if not isinstance(categories, list):
        return False, "categories must be a list"

    if len(categories) == 0:
        return False, "categories cannot be empty"

    if len(categories) > 3:
        return False, f"categories must have 1-3 items, got {len(categories)}"

    for cat in categories:
        # 转换为字符串进行检查
        cat_str = str(cat)
        if cat_str not in VALID_CATEGORY_IDS:
            return False, f"invalid category id: {cat}"

    # 验证年份
    year = metadata.get("publishYear")
    if not isinstance(year, int):
        return False, "publishYear must be an integer"

    if year < 1000 or year > 9999:
        return False, f"publishYear must be 4-digit, got {year}"

    return True, None


def _extract_json(text: str) -> str:
    """从文本中提取 JSON 字符串，支持多种格式."""
    text = text.strip()

    # 移除思考块（如 MiniMax 等模型的 <thinking>... 或 \n<think>...</think>）
    import re
    text = re.sub(r"\n*<think>[\s\S]*?</think>", "", text)
    text = re.sub(r"<thinking>[\s\S]*?</thinking>", "", text, flags=re.IGNORECASE)
    text = text.strip()

    # 移除 markdown 代码块
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    # 如果直接是 JSON，返回
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    # 尝试在文本中找 JSON 对象或数组
    # 找 JSON 对象
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            json.loads(m.group())
            return m.group()
        except json.JSONDecodeError:
            pass
    # 找 JSON 数组
    m = re.search(r"\[[\s\S]*\]", text)
    if m:
        try:
            json.loads(m.group())
            return m.group()
        except json.JSONDecodeError:
            pass

    return text


def parse_single_response(response_text: str) -> dict:
    """解析单本书的 LLM 响应"""
    try:
        text = _extract_json(response_text)
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Failed to parse JSON: {str(e)}"
        }

    # 检查 success 字段
    if "success" not in data:
        return {
            "success": False,
            "error": "Missing 'success' field in response"
        }

    # 如果失败，返回错误
    if not data["success"]:
        return {
            "success": False,
            "error": data.get("error", "Unknown error from LLM")
        }

    # 验证元数据
    metadata = data.get("metadata", {})
    is_valid, error_msg = validate_metadata(metadata)

    if not is_valid:
        return {
            "success": False,
            "error": error_msg
        }

    # 将分类数字转换为分类名称
    category_names = convert_category_ids_to_names(metadata["categories"])

    return {
        "success": True,
        "metadata": {
            "description": metadata["description"],
            "categories": category_names,
            "publishYear": metadata["publishYear"]
        }
    }


def parse_batch_response(response_text: str, expected_count: int) -> list[dict]:
    """解析批量处理的 LLM 响应"""
    try:
        text = _extract_json(response_text)
        data = json.loads(text)
    except json.JSONDecodeError as e:
        # 返回所有失败
        return [{
            "success": False,
            "error": f"Failed to parse JSON: {str(e)}"
        } for _ in range(expected_count)]

    if not isinstance(data, list):
        return [{
            "success": False,
            "error": "Response is not a JSON array"
        } for _ in range(expected_count)]

    results = []
    for i in range(expected_count):
        # 查找对应索引的结果
        item = None
        for d in data:
            if d.get("index") == i:
                item = d
                break

        if item is None:
            results.append({
                "success": False,
                "error": f"No result for index {i}"
            })
            continue

        if not item.get("success", False):
            results.append({
                "success": False,
                "error": item.get("error", "Unknown error")
            })
            continue

        metadata = item.get("metadata", {})
        is_valid, error_msg = validate_metadata(metadata)

        if not is_valid:
            results.append({
                "success": False,
                "error": error_msg
            })
        else:
            # 将分类数字转换为分类名称
            category_names = convert_category_ids_to_names(metadata["categories"])

            results.append({
                "success": True,
                "metadata": {
                    "description": metadata["description"],
                    "categories": category_names,
                    "publishYear": metadata["publishYear"]
                }
            })

    return results


async def call_llm_single(
    title: str,
    author: str,
    api_key: str,
    base_url: str,
    model: str,
    timeout: float = 60.0
) -> dict:
    """调用 LLM 获取单本书的元数据"""
    prompt = build_single_prompt(title, author)

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 1000
                }
            )

            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"LLM API error: {response.status_code}"
                }

            data = response.json()
            content = data["choices"][0]["message"]["content"]

            if content is None:
                return {
                    "success": False,
                    "error": "LLM returned empty response"
                }

            return parse_single_response(content)

        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "LLM request timeout"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"LLM request failed: {str(e)}"
            }


async def call_llm_batch(
    books: list[dict],
    api_key: str,
    base_url: str,
    model: str,
    timeout: float = 120.0
) -> list[dict]:
    """调用 LLM 批量获取多本书的元数据"""
    if not books:
        return []

    prompt = build_batch_prompt(books)

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 4000
                }
            )

            if response.status_code != 200:
                return [{
                    "success": False,
                    "error": f"LLM API error: {response.status_code}"
                } for _ in books]

            data = response.json()
            content = data["choices"][0]["message"]["content"]

            return parse_batch_response(content, len(books))

        except httpx.TimeoutException:
            return [{
                "success": False,
                "error": "LLM request timeout"
            } for _ in books]
        except Exception as e:
            return [{
                "success": False,
                "error": f"LLM request failed: {str(e)}"
            } for _ in books]