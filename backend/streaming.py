"""SSE streaming for answers: Grok-style status phases plus LLM token stream.

Event schema (one JSON object per SSE data frame):
- {"type": "status", "phase": "searching" | "reading" | "writing" | "thinking"}
- {"type": "rewrite", "query": "..."} (only when a follow-up was resolved)
- {"type": "sources", "sources": [...]} (search mode only)
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
    build_chat_chain,
    build_context,
    build_system_extra,
    format_history,
    get_llm,
    load_memory_context,
    maybe_learn_memories,
    related_questions,
    rewrite_query,
    route_message,
)
from backend.deep import (
    DEEP_PER_SEARCH,
    decompose,
    merge_results,
    reflect_gaps,
    search_many,
)
from verixa.search import web_search


def _frame(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _status(phase: str) -> str:
    return _frame({"type": "status", "phase": phase})


async def _stream_text(chain, payload: dict) -> AsyncIterator[str]:
    """Yield raw text chunks from a LangChain chain."""
    async for chunk in chain.astream(payload):
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
            yield text


async def event_stream(
    query: str,
    history: list[dict] | None = None,
    profile: dict | None = None,
    num_results: int | None = None,
    user_id=None,
    mode: str = "search",
) -> AsyncIterator[str]:
    history = history or []
    count = num_results or DEFAULT_RESULTS
    try:
        llm = get_llm()
        if mode != "deep":
            mode = await run_in_threadpool(route_message, query, history, llm)
    except Exception:
        mode = "search"

    if mode == "deep":
        yield _status("researching")
        try:
            memories, auto_learn = await run_in_threadpool(
                load_memory_context, user_id
            )
            extra = build_system_extra(profile, memories)
            history_text = format_history(history)
            yield _frame({"type": "progress", "label": "Planning research angles"})
            plan = await run_in_threadpool(decompose, query, history_text, llm)
            collected = []
            # Parallel fan-out: one progress frame for the batch, all Exa
            # searches run concurrently via a thread pool (no extra latency
            # per angle vs sequential awaits).
            yield _frame(
                {
                    "type": "progress",
                    "label": f"Searching {len(plan)} angles in parallel",
                }
            )
            try:
                batch = await run_in_threadpool(search_many, plan, DEEP_PER_SEARCH)
                collected.extend(batch)
            except Exception:
                pass
            context, sources = merge_results(collected)
            yield _frame({"type": "progress", "label": "Checking what is missing"})
            followups = await run_in_threadpool(reflect_gaps, query, context, llm)
            if followups:
                yield _frame(
                    {
                        "type": "progress",
                        "label": f"Running {len(followups)} follow-up searches in parallel",
                    }
                )
                try:
                    batch = await run_in_threadpool(
                        search_many, followups, DEEP_PER_SEARCH
                    )
                    collected.extend(batch)
                except Exception:
                    pass
            if followups:
                context, sources = merge_results(collected)
            yield _frame({"type": "sources", "sources": sources})
            yield _status("writing")
            chain = build_answer_chain(extra)
            full_text = ""
            async for text in _stream_text(
                chain,
                {"history": history_text, "query": query, "context": context},
            ):
                full_text += text
                yield _frame({"type": "token", "text": text})
        except Exception as exc:
            yield _frame({"type": "error", "message": f"Deep research failed: {exc}"})
            return
        yield _frame({"type": "done"})
        await run_in_threadpool(
            maybe_learn_memories, user_id, query, full_text, get_llm(), auto_learn
        )
        related = await run_in_threadpool(
            related_questions, query, full_text, get_llm()
        )
        if related:
            yield _frame({"type": "related", "questions": related})
        return

    if mode == "chat":
        yield _status("thinking")
        yield _frame({"type": "mode", "mode": "chat"})
        try:
            memories, auto_learn = await run_in_threadpool(
                load_memory_context, user_id
            )
            chain = build_chat_chain(build_system_extra(profile, memories))
            full_text = ""
            async for text in _stream_text(
                chain,
                {"history": format_history(history), "query": query},
            ):
                full_text += text
                yield _frame({"type": "token", "text": text})
        except Exception as exc:
            yield _frame({"type": "error", "message": f"Answer failed: {exc}"})
            return
        yield _frame({"type": "done"})
        await run_in_threadpool(
            maybe_learn_memories, user_id, query, full_text, get_llm(), auto_learn
        )
        related = await run_in_threadpool(
            related_questions, query, full_text, get_llm()
        )
        if related:
            yield _frame({"type": "related", "questions": related})
        return

    yield _status("searching")
    try:
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
        memories, auto_learn = await run_in_threadpool(load_memory_context, user_id)
        chain = build_answer_chain(build_system_extra(profile, memories))
        full_text = ""
        async for text in _stream_text(
            chain,
            {
                "history": format_history(history),
                "query": query,
                "context": context,
            },
        ):
            full_text += text
            yield _frame({"type": "token", "text": text})
    except Exception as exc:
        yield _frame({"type": "error", "message": f"Answer generation failed: {exc}"})
        return

    yield _frame({"type": "done"})
    await run_in_threadpool(
        maybe_learn_memories, user_id, query, full_text, get_llm(), auto_learn
    )
    related = await run_in_threadpool(
        related_questions, query, full_text, get_llm()
    )
    if related:
        yield _frame({"type": "related", "questions": related})
