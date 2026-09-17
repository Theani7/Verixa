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
    build_deep_answer_chain,
    build_system_extra,
    fit_context,
    format_history,
    get_llm,
    is_rate_limit_error,
    load_memory_context,
    maybe_learn_memories,
    normalize_citations,
    related_questions,
)
from backend.verify import (
    ClaimVerification,
    VerificationReport,
    extract_claims,
    needs_rewrite,
    rewrite_feedback,
    report_to_dict,
    verify_claims_batch,
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
    """Legacy adapter: claim-level verification summarized as problem lines.

    Kept for backward compatibility; new code should use verify_report().
    """
    report = verify_report(query, context, draft, llm)
    return rewrite_feedback(report.results).splitlines() if report.results else []


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
    # Tiered evidence budget: top-ranked sources keep long evidence, the
    # tail gets compact blocks. Keeps deep context inside Groq's free-tier
    # TPM window (see fit_context) instead of one flat 2400-char cap that
    # can blow past 8000 tokens/minute.
    for i, entry in enumerate(picked, start=1):
        url = entry["url"]
        evidence = entry["text"] or "\n".join(entry["highlights"][:3])
        if not entry["text"] and url in texts:
            evidence = texts[url][:DEEP_FULLTEXT_CHARS] or evidence
        per_cap = 2600 if i <= DEEP_TEXT_FETCH_TOP else 800
        excerpt = (entry["highlights"][0] if entry["highlights"] else evidence)[:220]
        sources.append({"id": i, "title": entry["title"], "url": url, "excerpt": excerpt})
        date_line = f"\nPublished: {entry['date']}" if entry["date"] else ""
        blocks.append(
            f"[{i}] {entry['title']}\nURL: {url}{date_line}\n{evidence[:per_cap]}"
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


def source_texts_for_verify(
    context: str, sources: list[dict] | None = None
) -> tuple[dict[int, str], dict[int, dict]]:
    """Rebuild per-source evidence + metadata from merged context.

    Parses the numbered [n] blocks built by merge_results() so the
    verifier checks each claim against its *cited* source text.
    Never raises: unparsable blocks yield empty evidence (which the
    verifier treats as unsupported, never as supported).
    """
    texts: dict[int, str] = {}
    meta: dict[int, dict] = {}
    by_id = {s.get("id"): s for s in (sources or []) if isinstance(s, dict)}
    current: int | None = None
    buf: list[str] = []
    for line in (context or "").splitlines():
        head = __import__("re").match(r"^\[(\d+)\]\s+(.*)", line.strip())
        if head:
            if current is not None:
                texts[current] = "\n".join(buf).strip()
            current = int(head.group(1))
            buf = [head.group(2)]
        elif current is not None:
            buf.append(line)
    if current is not None:
        texts[current] = "\n".join(buf).strip()
    for sid, text in texts.items():
        s = by_id.get(sid, {}) or {}
        meta[sid] = {"url": s.get("url", ""), "title": s.get("title", "")}
    return texts, meta


def verify_report(
    query: str,
    context: str,
    draft: str,
    llm,
    sources: list[dict] | None = None,
    redact_query: bool = False,
) -> VerificationReport:
    """Claim-level verification: extract -> batch-verify -> report.

    One LLM call for extraction, one for verification (batched over all
    claims against already-retrieved text). No extra web searches.
    Rule-based fallback keeps every claim checked when the model fails.
    redact_query keeps the user's question out of logs (incognito).
    """
    import logging as logging_lib

    log = logging_lib.getLogger("verixa.verify")
    claims = extract_claims(draft, llm)
    texts, meta = source_texts_for_verify(context, sources)
    failures = 0
    try:
        results = verify_claims_batch(claims, texts, meta, llm)
    except Exception as exc:
        log.warning("verify_report batch failed, rule fallback: %s", exc)
        failures = 1
        from backend.verify import rule_verify_claim as rule_each

        results = [rule_each(c, texts, meta) for c in claims]
    report = VerificationReport(claims=claims, results=results)
    metrics = report.to_metrics()
    metrics["verification_failures"] = failures
    report.metrics = metrics
    log.info(
        "verify query=%s claims=%d supported=%d partial=%d unsupported=%d "
        "contradicted=%d unclear=%d",
        "(redacted)" if redact_query else query[:60],
        metrics.get("claims_extracted", 0),
        metrics.get("claims_supported", 0),
        metrics.get("claims_partially_supported", 0),
        metrics.get("claims_unsupported", 0),
        metrics.get("claims_contradicted", 0),
        metrics.get("claims_unclear", 0),
    )
    return report


def _invoke_with_retry(chain, payload: dict, llm, attempts: int = 3):
    """Invoke a chain; on Groq 413/TPM errors shrink context and retry.

    Free-tier TPM (8000 for gpt-oss-120b) can reject a deep-research
    request even after fit_context() when history/memory inflate the
    prompt. Each retry halves the context so the answer still ships.
    """
    payload = dict(payload)
    for attempt in range(3):
        try:
            return chain.invoke(payload)
        except Exception as exc:
            if not is_rate_limit_error(exc) or attempt == 2:
                raise
            current_tokens = len(payload.get("context") or "") // 4
            payload["context"] = fit_context(
                payload.get("context", ""),
                token_budget=max(1000, current_tokens // 2),
            )
    raise RuntimeError("unreachable")


def synthesize_report(
    query: str,
    history_text: str,
    context: str,
    extra: str,
    llm,
    sources: list[dict] | None = None,
    on_progress=None,
    incognito: bool = False,
) -> tuple[str, dict]:
    """Draft -> claim-verify -> targeted rewrite -> final verification.

    Returns (final_answer, metrics). Only problematic claims are
    rewritten; clean drafts publish after the first pass. A second
    extract+verify pass gates publishing so the streamed answer is the
    verified final text.
    """
    safe_context = fit_context(context)
    draft = _invoke_with_retry(
        build_deep_answer_chain(extra),
        {"history": history_text, "query": query, "context": safe_context},
        llm,
    )
    text = draft.content if isinstance(draft.content, str) else ""
    report = verify_report(
        query, safe_context, text, llm, sources, redact_query=incognito
    )
    metrics = dict(report.to_metrics())
    bad = [r for r in report.results if needs_rewrite(r)]
    if not bad:
        return normalize_citations(text), metrics
    if on_progress is not None:
        try:
            on_progress(f"Rewriting {len(bad)} unsupported claims")
        except Exception:
            pass
    feedback = rewrite_feedback(report.results)
    metrics["claims_rewritten"] = len(bad)
    fixed = _invoke_with_retry(
        build_deep_answer_chain(extra, draft_feedback=feedback),
        {"history": history_text, "query": query, "context": safe_context},
        llm,
    )
    final = fixed.content if isinstance(fixed.content, str) else ""
    final_report = verify_report(
        query, safe_context, final or text, llm, sources, redact_query=incognito
    )
    final_metrics = final_report.to_metrics()
    final_metrics["claims_rewritten"] = len(bad)
    # Publish the rewrite only if it did not get worse; otherwise keep
    # the draft so a bad rewrite can never replace a cleaner original.
    if final_metrics.get("claims_unsupported", 0) + final_metrics.get(
        "claims_contradicted", 0
    ) <= metrics.get("claims_unsupported", 0) + metrics.get(
        "claims_contradicted", 0
    ):
        return normalize_citations(final or text), final_metrics
    return normalize_citations(text), metrics


def deep_answer(
    query: str,
    history: list[dict] | None = None,
    profile: dict | None = None,
    user_id=None,
    on_progress=None,
    incognito: bool = False,
) -> dict:
    history = history or []
    llm = get_llm()
    history_text = format_history(history)
    if incognito:
        # Privacy mode: no personalization context, no memory learning.
        memories, auto_learn = [], False
    else:
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

    progress("Drafting the report")
    content, verify_metrics = synthesize_report(
        query, history_text, context, extra, llm, sources, progress, incognito
    )
    import logging as logging_lib

    logging_lib.getLogger("verixa.verify").info(
        "deep query=%s rounds plan=%d executed=%d retrieved=%d used=%d %s",
        "(redacted)" if incognito else query[:60],
        len(plan),
        len(seen_queries),
        sum(len(getattr(r, "results", []) or []) for r in collected),
        len(sources),
        " ".join(f"{k}={v}" for k, v in sorted(verify_metrics.items())),
    )
    maybe_learn_memories(user_id, query, content, llm, auto_learn)
    return {
        "answer": content,
        "sources": sources,
        "query": query,
        "mode": "deep",
        "related": related_questions(query, content, llm),
    }
