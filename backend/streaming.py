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
    build_deep_answer_chain,
    build_system_extra,
    fit_context,
    format_history,
    get_llm,
    load_memory_context,
    maybe_learn_memories,
    normalize_citations,
    related_questions,
    rewrite_query,
    route_message,
)
from backend.deep import (
    DEEP_FOLLOWUPS,
    DEEP_FULLTEXT_CHARS,
    DEEP_MAX_ROUNDS,
    DEEP_TEXT_FETCH_TOP,
    collect_round,
    decompose,
    merge_results,
    reflect_gaps,
    run_research_round,
    synthesize_report,
    verify_report,
)
from verixa.search import get_page_texts, web_search


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
            collected: list = []
            seen_queries: set[str] = set()
            context, sources = "", []
            seen_str = ""
            for round_no in range(1, DEEP_MAX_ROUNDS + 1):
                if round_no == 1:
                    yield _frame(
                        {
                            "type": "progress",
                            "label": f"Round 1: searching {len(plan)} angles in parallel",
                        }
                    )
                    context, sources, _, seen_str = await run_in_threadpool(
                        collect_round,
                        query,
                        plan,
                        collected,
                        seen_queries,
                        llm,
                        round_no,
                    )
                else:
                    yield _frame(
                        {
                            "type": "progress",
                            "label": f"Round {round_no}: checking what is still missing",
                        }
                    )
                    followups = await run_in_threadpool(
                        reflect_gaps, query, context, llm, DEEP_FOLLOWUPS, seen_str
                    )
                    if not followups:
                        break
                    yield _frame(
                        {
                            "type": "progress",
                            "label": f"Round {round_no}: running {len(followups)} follow-ups in parallel",
                        }
                    )
                    await run_in_threadpool(
                        run_research_round, followups, seen_queries, collected
                    )
                    context, sources, _, seen_str = await run_in_threadpool(
                        collect_round, query, [], collected, seen_queries, llm, 0
                    )
                if not collected:
                    break
            yield _frame({"type": "progress", "label": "Reading top sources in full"})
            if sources:
                top_urls = [s["url"] for s in sources[:DEEP_TEXT_FETCH_TOP]]
                try:
                    fulltexts = await run_in_threadpool(
                        get_page_texts, top_urls, DEEP_FULLTEXT_CHARS
                    )
                except Exception:
                    fulltexts = {}
                if fulltexts:
                    context, sources = merge_results(collected, fulltexts=fulltexts)
            yield _frame({"type": "sources", "sources": sources})
            yield _status("writing")
            yield _frame(
                {"type": "progress", "label": "Drafting the report"}
            )
            safe_context = fit_context(context)
            chain = build_deep_answer_chain(extra)
            draft_text = ""
            async for text in _stream_text(
                chain,
                {"history": history_text, "query": query, "context": safe_context},
            ):
                draft_text += text
            # Claim-level verify-then-publish: extract claims, batch-verify
            # each against its cited source, rewrite only problematic
            # claims, then re-verify. Draft tokens stay withheld; only the
            # verified final text is streamed.
            yield _frame({"type": "progress", "label": "Extracting claims"})
            try:
                report = await run_in_threadpool(
                    verify_report, query, safe_context, draft_text, llm, sources
                )
            except Exception:
                report = None
            from backend.verify import needs_rewrite as _needs
            from backend.verify import rewrite_feedback as _fb

            bad = [r for r in (report.results if report else []) if _needs(r)]
            full_text = draft_text
            if bad:
                feedback = _fb(report.results)
                yield _frame(
                    {
                        "type": "progress",
                        "label": f"Rewriting {len(bad)} unsupported claims",
                    }
                )
                chain = build_deep_answer_chain(extra, draft_feedback=feedback)
                full_text = ""
                async for text in _stream_text(
                    chain,
                    {"history": history_text, "query": query, "context": safe_context},
                ):
                    full_text += text
                yield _frame({"type": "progress", "label": "Final verification"})
                try:
                    final_report = await run_in_threadpool(
                        verify_report, query, safe_context, full_text, llm, sources
                    )
                except Exception:
                    final_report = None
                if final_report is not None:
                    f_bad = sum(
                        1 for r in final_report.results if _needs(r)
                    )
                    # Keep the rewrite only if it did not get worse.
                    if f_bad > len(bad):
                        full_text = draft_text
            full_text = normalize_citations(full_text)
            for chunk in [full_text[i : i + 1200] for i in range(0, len(full_text), 1200)]:
                yield _frame({"type": "token", "text": chunk})
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
