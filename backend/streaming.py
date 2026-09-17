"""SSE streaming for answers: Grok-style status phases plus LLM token stream.

Event schema (one JSON object per SSE data frame):
- {"type": "status", "phase": "searching" | "reading" | "writing"}
- {"type": "sources", "sources": [...]}
- {"type": "token", "text": "..."}
- {"type": "done"}
- {"type": "error", "message": "..."}
"""

import json
from collections.abc import AsyncIterator

from starlette.concurrency import run_in_threadpool

from backend.chain import build_answer_chain, build_context
from verixa.search import web_search


def _frame(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _status(phase: str) -> str:
    return _frame({"type": "status", "phase": phase})


async def event_stream(query: str) -> AsyncIterator[str]:
    yield _status("searching")
    try:
        result = await run_in_threadpool(web_search, query)
    except Exception as exc:
        yield _frame({"type": "error", "message": f"Web search failed: {exc}"})
        return

    context, sources = build_context(result)
    yield _status("reading")
    yield _frame({"type": "sources", "sources": sources})
    yield _status("writing")

    try:
        chain = build_answer_chain()
        async for chunk in chain.astream({"query": query, "context": context}):
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
