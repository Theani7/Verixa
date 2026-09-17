"""SSE streaming for answers: Grok-style status phases plus LLM token stream.

Event schema (one JSON object per SSE data frame):
- {"type": "status", "phase": "searching" | "reading" | "writing"}
- {"type": "rewrite", "query": "..."} (only when a follow-up was resolved)
- {"type": "sources", "sources": [...]}
- {"type": "token", "text": "..."}
- {"type": "done"}
- {"type": "error", "message": "..."}
"""

import json
from collections.abc import AsyncIterator

from starlette.concurrency import run_in_threadpool

from backend.chain import (
    DEFAULT_RESULTS,
    build_answer_chain,
    build_context,
    build_system_extra,
    format_history,
    get_llm,
    load_memories,
    rewrite_query,
)
from verixa.search import web_search


def _frame(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _status(phase: str) -> str:
    return _frame({"type": "status", "phase": phase})


async def event_stream(
    query: str,
    history: list[dict] | None = None,
    profile: dict | None = None,
    num_results: int | None = None,
    user_id=None,
) -> AsyncIterator[str]:
    history = history or []
    count = num_results or DEFAULT_RESULTS
    yield _status("searching")
    try:
        llm = get_llm()
        standalone = await run_in_threadpool(rewrite_query, query, history, llm)
        if standalone.strip().lower() != query.strip().lower():
            yield _frame({"type": "rewrite", "query": standalone})
        result = await run_in_threadpool(web_search, standalone, count)
    except Exception as exc:
        yield _frame({"type": "error", "message": f"Web search failed: {exc}"})
        return

    context, sources = build_context(result, max_results=count)
    yield _status("reading")
    yield _frame({"type": "sources", "sources": sources})
    yield _status("writing")

    try:
        memories = await run_in_threadpool(load_memories, user_id)
        chain = build_answer_chain(build_system_extra(profile, memories))
        async for chunk in chain.astream(
            {
                "history": format_history(history),
                "query": query,
                "context": context,
            }
        ):
            content = chunk.content
            if isinstance(content, str):
                text = content
            else:
                text = "".join(
                    block.get("text", "")
                    for block in content
                    if isinstance(block, dict)
                )
            if text:
                yield _frame({"type": "token", "text": text})
    except Exception as exc:
        yield _frame({"type": "error", "message": f"Answer generation failed: {exc}"})
        return

    yield _frame({"type": "done"})
