"""Deep research loop: decompose, search, reflect, refine, synthesize.

Unlike the single-shot /search path, deep mode runs several Exa searches
guided by the model: it plans sub-questions, searches them in parallel,
reflects on gaps, runs follow-up searches, then synthesizes everything
into one grounded answer. Slower by design.
"""

from concurrent.futures import ThreadPoolExecutor

from langchain_core.prompts import ChatPromptTemplate

from backend.chain import (
    DEEP_CHAR_CAP,
    DEEP_FOLLOWUPS,
    DEEP_PER_SEARCH,
    DEEP_SUBQUERIES,
    MAX_SOURCES,
    build_answer_chain,
    build_context,
    build_system_extra,
    format_history,
    get_llm,
    load_memory_context,
    maybe_learn_memories,
    normalize_citations,
    related_questions,
)
from verixa.search import web_search

DECOMPOSE_SYSTEM_PROMPT = (
    "Break the research question into focused sub-questions for web search. "
    "Cover different angles with no duplicates. Return a JSON array of "
    "short strings, max 12 words each. Return ONLY the JSON array."
)

REFLECT_SYSTEM_PROMPT = (
    "Given the research question and the findings gathered so far, list the "
    "follow-up web searches still needed to fill real gaps. Return a JSON "
    "array of short search queries, or [] when the findings already answer "
    "the question. Return ONLY the JSON array."
)


def _parse_list(response, max_items: int, max_len: int) -> list[str]:
    import json as json_lib

    content = response.content if isinstance(response.content, str) else ""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if "\n" in text:
            text = text.split("\n", 1)[1]
    try:
        parsed = json_lib.loads(text)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [
        item.strip()[:max_len]
        for item in parsed[:max_items]
        if isinstance(item, str) and item.strip()
    ]


def decompose(query: str, history_text: str, llm, count: int = DEEP_SUBQUERIES) -> list[str]:
    """Plan focused sub-questions. Falls back to the raw query."""
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", DECOMPOSE_SYSTEM_PROMPT),
                (
                    "human",
                    "Conversation so far:\n{history}\n\nResearch question: {query}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {"history": history_text, "query": query[:500]}
        )
        out = _parse_list(response, count, 140)
        return out or [query]
    except Exception:
        return [query]


def reflect_gaps(query: str, findings: str, llm, count: int = DEEP_FOLLOWUPS) -> list[str]:
    """Follow-up searches for real gaps. Empty when findings suffice."""
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", REFLECT_SYSTEM_PROMPT),
                (
                    "human",
                    "Research question: {query}\n\nFindings so far:\n{findings}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {"query": query[:500], "findings": findings[:6000]}
        )
        return _parse_list(response, count, 140)
    except Exception:
        return []


def search_many(queries: list[str], per_search: int = DEEP_PER_SEARCH) -> list:
    """Run Exa searches in parallel. Failures drop out, never fail all."""
    if not queries:
        return []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [
            pool.submit(_safe_search, q, per_search) for q in queries[:12]
        ]
        results = []
        for future in futures:
            result = future.result()
            if result is not None:
                results.append(result)
        return results


def _safe_search(query: str, per_search: int):
    try:
        return web_search(query, num_results=per_search)
    except Exception:
        return None


def merge_results(results: list, cap: int = MAX_SOURCES) -> tuple[str, list[dict]]:
    """Dedupe by URL across searches and renumber into one context."""
    seen: dict[str, dict] = {}
    order: list[str] = []
    for result in results:
        for item in getattr(result, "results", []) or []:
            url = getattr(item, "url", "") or ""
            if not url or url in seen:
                continue
            seen[url] = {
                "title": getattr(item, "title", "") or "",
                "url": url,
                "highlights": getattr(item, "highlights", None) or [],
            }
            order.append(url)
    blocks: list[str] = []
    sources: list[dict] = []
    for i, url in enumerate(order[:cap], start=1):
        entry = seen[url]
        highlights = "\n".join(entry["highlights"][:2])
        sources.append(
            {
                "id": i,
                "title": entry["title"],
                "url": url,
                "excerpt": (entry["highlights"][0] if entry["highlights"] else "")[:220],
            }
        )
        blocks.append(f"[{i}] {entry['title']}\nURL: {url}\n{highlights[:DEEP_CHAR_CAP]}")
    return "\n\n".join(blocks), sources


def deep_answer(
    query: str,
    history: list[dict] | None = None,
    profile: dict | None = None,
    user_id=None,
    on_progress=None,
) -> dict:
    history = history or []
    llm = get_llm()
    history_text = format_history(history)
    memories, auto_learn = load_memory_context(user_id)
    extra = build_system_extra(profile, memories)

    def progress(label: str) -> None:
        if on_progress is not None:
            on_progress(label)

    progress("Planning research angles")
    plan = decompose(query, history_text, llm)
    progress(f"Searching {len(plan)} angles in parallel")
    first = search_many(plan)
    context, sources = merge_results(first)

    progress("Checking what is still missing")
    followups = reflect_gaps(query, context, llm)
    if followups:
        progress(f"Running {len(followups)} follow-up searches")
        second = search_many(followups)
        context, sources = merge_results([*first, *second])

    progress("Writing the final answer")
    chain = build_answer_chain(extra)
    response = chain.invoke(
        {"history": history_text, "query": query, "context": context}
    )
    content = response.content if isinstance(response.content, str) else ""
    maybe_learn_memories(user_id, query, content, llm, auto_learn)
    return {
        "answer": normalize_citations(content),
        "sources": sources,
        "query": query,
        "mode": "deep",
        "related": related_questions(query, content, llm),
    }
