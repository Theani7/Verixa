"""SSE streaming for answers: Grok-style status phases plus LLM token stream.

Event schema (one JSON object per SSE data frame):
- {"type": "status", "phase": "searching" | "reading" | "writing" | "thinking"}
- {"type": "rewrite", "query": "..."} (only when a follow-up was resolved)
- {"type": "sources", "sources": [...]} (search mode only)
- {"type": "token", "text": "..."}
- {"type": "done"}
- {"type": "error", "message": "..."}
"""

import asyncio
import json
from collections.abc import AsyncIterator

from starlette.concurrency import run_in_threadpool

from backend.chain import (
    DEFAULT_RESULTS,
    build_answer_chain,
    build_chat_chain,
    build_deep_answer_chain,
    build_system_extra,
    build_context,
    format_history,
    load_memory_context,
    maybe_learn_memories,
    normalize_citations,
    related_questions,
    resolve_memory_context,
    rewrite_query,
    route_message,
    SMALLTALK_RE,
)
from backend.clients import create_custom_llm, get_llm
from backend.deep import deep_research_report, verify_report
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
    incognito: bool = False,
    custom_llm: dict | None = None,
) -> AsyncIterator[str]:

    history = history or []
    count = num_results or DEFAULT_RESULTS
    try:
        llm = create_custom_llm(custom_llm)
    except Exception as exc:
        yield _frame({"type": "error", "message": f"LLM setup failed: {exc}"})
        return

    if mode != "deep":
        if mode == "chat" or SMALLTALK_RE.match(query.strip()):
            mode = "chat"
        elif mode == "search":
            mode = "search"
        else:
            try:
                mode = await run_in_threadpool(route_message, query, history, llm)
            except Exception:
                mode = "search"

    if mode == "deep":
        yield _status("researching")
        try:
            memories, auto_learn = resolve_memory_context(user_id, incognito)
            extra = build_system_extra(profile, memories)
            history_text = format_history(history)

            yield _frame({"type": "progress", "label": "Planning research angles"})
            research = await run_in_threadpool(
                deep_research_report,
                query,
                history,
                profile,
                user_id,
                incognito=incognito,
                on_progress=None,
                llm=llm,
            )

            context = research.get("context", "")
            sources = research.get("sources", [])
            if sources:
                yield _frame({"type": "sources", "sources": sources})
            yield _status("writing")
            yield _frame({"type": "progress", "label": "Extracting claims"})

            llm_now = llm
            report = None
            try:
                report = await run_in_threadpool(
                    verify_report,
                    query,
                    context,
                    research.get("answer", ""),
                    llm_now,
                    sources,
                    incognito,
                )
            except Exception:
                report = None
            from backend.verify import needs_rewrite as _needs
            from backend.verify import rewrite_feedback as _fb

            bad = [r for r in (report.results if report else []) if _needs(r)]
            full_text = research.get("answer", "")
            if bad:
                feedback = _fb(report.results)
                yield _frame(
                    {
                        "type": "progress",
                        "label": f"Rewriting {len(bad)} unsupported claims",
                    }
                )
                chain = build_deep_answer_chain(extra, draft_feedback=feedback, llm=llm)
                full_text = ""
                async for text in _stream_text(
                    chain,
                    {"history": history_text, "query": query, "context": context},
                ):
                    full_text += text
                yield _frame({"type": "progress", "label": "Final verification"})
                try:
                    final_report = await run_in_threadpool(
                        verify_report,
                        query,
                        context,
                        full_text,
                        llm_now,
                        sources,
                        incognito,
                    )
                except Exception:
                    final_report = None
                if final_report is not None:
                    f_bad = sum(
                        1 for r in final_report.results if _needs(r)
                    )
                    if f_bad > len(bad):
                        full_text = research.get("answer", "")
            else:
                full_text = research.get("answer", "")
            full_text = normalize_citations(full_text)
            for chunk in [full_text[i : i + 1200] for i in range(0, len(full_text), 1200)]:
                yield _frame({"type": "token", "text": chunk})
        except Exception as exc:
            yield _frame({"type": "error", "message": f"Deep research failed: {exc}"})
            return
        yield _frame({"type": "done"})
        await run_in_threadpool(
            maybe_learn_memories, user_id, query, full_text, llm, auto_learn
        )
        related = await run_in_threadpool(
            related_questions, query, full_text, llm
        )
        if related:
            yield _frame({"type": "related", "questions": related})
        return

    if mode == "chat":
        yield _status("thinking")
        yield _frame({"type": "mode", "mode": "chat"})
        try:
            if incognito:
                memories, auto_learn = [], False
            else:
                memories, auto_learn = await run_in_threadpool(
                    load_memory_context, user_id
                )
            chain = build_chat_chain(build_system_extra(profile, memories), llm=llm)
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
            maybe_learn_memories, user_id, query, full_text, llm, auto_learn
        )
        related = await run_in_threadpool(
            related_questions, query, full_text, llm
        )
        if related:
            yield _frame({"type": "related", "questions": related})
        return

    yield _status("searching")
    try:
        if history:
            standalone = await run_in_threadpool(rewrite_query, query, history, llm)
            if standalone.strip().lower() != query.strip().lower():
                yield _frame({"type": "rewrite", "query": standalone})
        else:
            standalone = query
        result = await run_in_threadpool(web_search, standalone, count)
    except Exception as exc:
        yield _frame({"type": "error", "message": f"Web search failed: {exc}"})
        return

    context, sources = build_context(result, max_results=count)
    yield _status("reading")
    yield _frame({"type": "sources", "sources": sources})
    yield _status("writing")

    try:
        if incognito:
            memories, auto_learn = [], False
        else:
            memories, auto_learn = await run_in_threadpool(load_memory_context, user_id)
        chain = build_answer_chain(build_system_extra(profile, memories), llm=llm)
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
        maybe_learn_memories, user_id, query, full_text, llm, auto_learn
    )
    related = await run_in_threadpool(
        related_questions, query, full_text, llm
    )
    if related:
        yield _frame({"type": "related", "questions": related})
