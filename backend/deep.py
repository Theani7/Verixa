"""Deep research loop: plan, search, read, reflect, repeat, verify, synthesize.

Unlike the single-shot /search path, deep mode runs an iterative research
loop guided by the model:

1. Plan: break the question into typed angles (overview, evidence/stats,
   expert views, counter-views, recent developments, how-it-works).
2. Search: run each angle through Exa in parallel (with a query-relevant
   text extract per result, not just snippets).
3. Read: fetch full page text for the top-ranked sources via /contents.
4. Reflect: ask the model what is still missing -> targeted follow-ups.
   Repeat until gaps close or the round/cost budget is exhausted.
5. Rank: dedupe by URL, cap domains, rank by Exa score + coverage.
6. Verify: draft -> check every cited claim is supported -> rewrite weakly
   supported claims before publishing.

Slower and more expensive than search mode by design.
"""

from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

from langchain_core.prompts import ChatPromptTemplate

from backend.chain import (
    DEEP_CHAR_CAP,
    DEEP_FOLLOWUPS,
    DEEP_PER_SEARCH,
    DEEP_SUBQUERIES,
    MAX_SOURCES,
    build_answer_chain,
    build_context,
    build_deep_answer_chain,
    build_system_extra,
    format_history,
    get_llm,
    load_memory_context,
    maybe_learn_memories,
    normalize_citations,
    related_questions,
)
from verixa.search import get_page_texts, web_search

DECOMPOSE_SYSTEM_PROMPT = (
    "You are a research planner. Break the research question into focused "
    "sub-questions for web search, covering complementary angles: background "
    "overview, key facts and statistics, expert analysis, counter-views or "
    "criticisms, recent developments, and how-it-works details. Skip angles "
    "that do not fit the question. No duplicates. Return a JSON array of "
    "short strings, max 12 words each. Return ONLY the JSON array."
)

REFLECT_SYSTEM_PROMPT = (
    "You are a research editor. Given the research question and the findings "
    "gathered so far, list ONLY the follow-up web searches still needed to "
    "fill real gaps: missing facts, unverified claims, absent viewpoints, "
    "stale coverage. Do not repeat angles already covered. Be specific "
    "(include names, dates, places where relevant). Return a JSON array of "
    "short search queries, or [] when the findings already answer the "
    "question well. Return ONLY the JSON array."
)

VERIFY_SYSTEM_PROMPT = (
    "You are a fact-check editor. Given the research question, the numbered "
    "web sources, and a draft answer with [n] citations, flag every factual "
    "claim in the draft that is NOT clearly supported by the cited source "
    "text. Return a JSON array of short strings, each naming the unsupported "
    "claim and which citation fails it. Return [] when every cited claim is "
    "supported. Return ONLY the JSON array."
)

DEEP_MAX_ROUNDS = 3
DEEP_TEXT_FETCH_TOP = 6
DEEP_FULLTEXT_CHARS = 6000
DEEP_DOMAIN_CAP = 3
DEEP_OUTLINE_CHARS = 9000


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
    """Plan typed research angles. Falls back to the raw query."""
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


def reflect_gaps(
    query: str, findings: str, llm, count: int = DEEP_FOLLOWUPS, seen: str = ""
) -> list[str]:
    """Follow-up searches for real gaps. Empty when findings suffice."""
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", REFLECT_SYSTEM_PROMPT),
                (
                    "human",
                    "Research question: {query}\n\nQueries already run:\n{seen}\n\n"
                    "Findings so far:\n{findings}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {
                "query": query[:500],
                "seen": seen[:1000],
                "findings": findings[:9000],
            }
        )
        return _parse_list(response, count, 140)
    except Exception:
        return []


def verify_draft(query: str, context: str, draft: str, llm) -> list[str]:
    """Fact-check a draft against its cited sources. Empty = fully supported."""
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", VERIFY_SYSTEM_PROMPT),
                (
                    "human",
                    "Research question: {query}\n\nSources:\n{context}\n\nDraft:\n{draft}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {
                "query": query[:500],
                "context": context[:12000],
                "draft": draft[:8000],
            }
        )
        return _parse_list(response, 8, 200)
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


def merge_results(
    results: list,
    cap: int = MAX_SOURCES,
    fulltexts: dict[str, str] | None = None,
) -> tuple[str, list[dict]]:
    """Dedupe by URL, cap domains, rank by score+coverage, renumber as context."""
    seen: dict[str, dict] = {}
    for result in results:
        for item in getattr(result, "results", []) or []:
            url = getattr(item, "url", "") or ""
            if not url or url in seen:
                continue
            seen[url] = {
                "title": getattr(item, "title", "") or "",
                "url": url,
                "score": float(getattr(item, "score", 0.0) or 0.0),
                "highlights": getattr(item, "highlights", None) or [],
                "text": (getattr(item, "text", "") or ""),
                "date": getattr(item, "published_date", "") or "",
            }
    texts = fulltexts or {}
    ranked = sorted(
        seen.values(),
        key=lambda e: (e["score"], len(e["highlights"]) + (1 if e["text"] else 0)),
        reverse=True,
    )
    domain_counts: dict[str, int] = {}
    picked: list[dict] = []
    for entry in ranked:
        if len(picked) >= cap:
            break
        try:
            domain = urlparse(entry["url"]).netloc.lower().removeprefix("www.")
        except Exception:
            domain = ""
        if domain and domain_counts.get(domain, 0) >= DEEP_DOMAIN_CAP:
            continue
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        picked.append(entry)
    blocks: list[str] = []
    sources: list[dict] = []
    for i, entry in enumerate(picked, start=1):
        url = entry["url"]
        evidence = entry["text"] or "\n".join(entry["highlights"][:3])
        if not entry["text"] and url in texts:
            evidence = texts[url][:DEEP_FULLTEXT_CHARS] or evidence
        excerpt = (entry["highlights"][0] if entry["highlights"] else evidence)[:220]
        sources.append({"id": i, "title": entry["title"], "url": url, "excerpt": excerpt})
        date_line = f"\nPublished: {entry['date']}" if entry["date"] else ""
        blocks.append(
            f"[{i}] {entry['title']}\nURL: {url}{date_line}\n{evidence[:DEEP_CHAR_CAP * 2]}"
        )
    return "\n\n".join(blocks), sources


def run_research_round(
    queries: list[str],
    seen_queries: set[str],
    collected: list,
) -> tuple[list, list[str]]:
    """Search fresh queries in parallel. Returns (new_results, newly_run)."""
    fresh = [q for q in queries if q and q.lower() not in seen_queries]
    if not fresh:
        return [], []
    batch = search_many(fresh)
    for q in fresh:
        seen_queries.add(q.lower())
    collected.extend(batch)
    return batch, fresh


def collect_round(
    query: str,
    plan: list[str],
    collected: list,
    seen_queries: set[str],
    llm,
    round_no: int,
) -> tuple[str, list[dict], list[str], str]:
    """One search -> reflect round. Returns (context, sources, fresh, seen_str).

    Full-page reading happens once after all rounds (see deep_answer), so
    intermediate rounds stay fast and cheap.
    """
    fresh: list[str] = []
    if round_no == 1:
        _, fresh = run_research_round(plan or [query], seen_queries, collected)
    context, sources = merge_results(collected)
    seen_str = "\n- ".join(sorted(seen_queries))
    return context, sources, fresh, seen_str


def synthesize_report(
    query: str,
    history_text: str,
    context: str,
    extra: str,
    llm,
) -> str:
    """Draft a deep report, fact-check it, and rewrite flagged claims once."""
    draft = build_deep_answer_chain(extra).invoke(
        {"history": history_text, "query": query, "context": context}
    )
    text = draft.content if isinstance(draft.content, str) else ""
    try:
        problems = verify_draft(query, context, text, llm)
    except Exception:
        problems = []
    if not problems:
        return normalize_citations(text)
    feedback = "\n- ".join(problems)
    fixed = build_deep_answer_chain(extra, draft_feedback=feedback).invoke(
        {"history": history_text, "query": query, "context": context}
    )
    final = fixed.content if isinstance(fixed.content, str) else ""
    return normalize_citations(final or text)


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
    collected: list = []
    seen_queries: set[str] = set()
    context, sources = "", []

    for round_no in range(1, DEEP_MAX_ROUNDS + 1):
        if round_no == 1:
            progress(f"Round 1: searching {len(plan)} angles in parallel")
            context, sources, _, seen_str = collect_round(
                query, plan, collected, seen_queries, llm, round_no
            )
        else:
            progress(f"Round {round_no}: checking what is still missing")
            followups = reflect_gaps(query, context, llm, seen=seen_str)
            if not followups:
                break
            progress(f"Round {round_no}: running {len(followups)} follow-ups in parallel")
            _, _ = run_research_round(followups, seen_queries, collected)
            context, sources, _, seen_str = collect_round(
                query, [], collected, seen_queries, llm, 0
            )
            if round_no == DEEP_MAX_ROUNDS:
                break
        if not collected:
            break
        if round_no < DEEP_MAX_ROUNDS and not sources:
            continue

    progress("Reading top sources in full")
    if sources:
        top_urls = [s["url"] for s in sources[:DEEP_TEXT_FETCH_TOP]]
        try:
            fulltexts = get_page_texts(top_urls, max_chars=DEEP_FULLTEXT_CHARS)
        except Exception:
            fulltexts = {}
        if fulltexts:
            context, sources = merge_results(collected, fulltexts=fulltexts)

    if not sources:
        context, sources = merge_results(collected)

    progress("Drafting, verifying, and writing the final report")
    content = synthesize_report(query, history_text, context, extra, llm)
    maybe_learn_memories(user_id, query, content, llm, auto_learn)
    return {
        "answer": content,
        "sources": sources,
        "query": query,
        "mode": "deep",
        "related": related_questions(query, content, llm),
    }
