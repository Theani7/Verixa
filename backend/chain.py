"""Answer synthesis with LangChain + Groq over Exa search results.

Per build-with-exa skill:
- Retrieval uses /search with the recommended request only
  (query + type auto + contents highlights).
- This app HAS its own chat LLM (ChatGroq via LangChain), so we give
  it /search results as context instead of calling /answer.
- Follow-up questions are rewritten into standalone queries using the
  thread history, so "how old is he" searches for the actual person.
"""

import os
import re

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

from verixa.search import web_search

load_dotenv()

DEFAULT_RESULTS = 5

# Deep research budgets: many small parallel searches stay inside token limits
# where one giant context would overflow them.
DEEP_SUBQUERIES = 8
DEEP_FOLLOWUPS = 4
DEEP_PER_SEARCH = 5
DEEP_CHAR_CAP = 1200
MAX_SOURCES = 20

# Groq on-demand TPM limit (free tier = 8000 for gpt-oss-120b). The ask /
# deep-report call reserves headroom for the system prompt, history, and
# output; the rest is the context budget. Set GROQ_TPM_LIMIT higher
# (e.g. 60000 on the Dev Tier) to let deep research use its full budget.
GROQ_TPM_LIMIT = int(os.getenv("GROQ_TPM_LIMIT", "8000"))
CONTEXT_TOKEN_BUDGET = max(2000, GROQ_TPM_LIMIT - 3000)
_CHARS_PER_TOKEN = 4


def fit_context(context: str, token_budget: int | None = None) -> str:
    """Trim the source context to stay under the Groq TPM window.

    Drops the lowest-priority [n] blocks (highest numbers = lowest rank)
    first, so citations stay valid and the strongest sources survive
    intact. If even the remaining blocks are too big, each block is
    truncated proportionally until it fits.
    """
    if not context:
        return context
    budget_tokens = token_budget or max(1500, GROQ_TPM_LIMIT - 3000)
    if len(context) <= budget_tokens * _CHARS_PER_TOKEN:
        return context
    parts = re.split(r"(?=\n\n\[\d+\] )", "\n\n" + context)
    if parts and parts[0] == "":
        parts = parts[1:]
    # Pass 1: drop tail blocks (lowest-ranked sources) while over budget.
    kept: list[str] = []
    used = 0
    for part in parts:
        cost = len(part) // _CHARS_PER_TOKEN + 8
        if kept and used + cost > budget_tokens:
            break
        kept.append(part)
        used += cost
    trimmed = "".join(kept).strip()
    # Pass 2: still over? Halve every block until it fits.
    for _ in range(6):
        if _estimate_tokens(trimmed) <= budget_tokens or "\n\n[" not in trimmed:
            break
        trimmed = _shrink_blocks(trimmed)
    return trimmed


def _estimate_tokens(text: str) -> int:
    return len(text or "") // _CHARS_PER_TOKEN


def _shrink_blocks(context: str) -> str:
    halves = []
    for block in re.split(r"(?=\n\n\[\d+\] )", "\n\n" + context):
        if block.startswith("\n\n"):
            block = block[2:]
        halves.append(block[: max(200, len(block) // 2)])
    return "".join(halves)


def is_rate_limit_error(exc: Exception) -> bool:
    """True when an LLM call failed with a Groq 413 / TPM error."""
    text = str(exc)
    return "413" in text or "rate_limit_exceeded" in text or "TPM" in text


# Deep research budgets: many small parallel searches stay inside token limits
# where one giant context would overflow them.
DEEP_SUBQUERIES = 8
DEEP_FOLLOWUPS = 4
DEEP_PER_SEARCH = 5
DEEP_CHAR_CAP = 1200
MAX_SOURCES = 20

# Model-native grounding markers (e.g. 【2†L1-L9】 or bare 【1】).
NATIVE_CITATION_RE = re.compile(r"【(\d+)(?:[†‡][^】]*)?】")

SYSTEM_PROMPT = (
    "You are Verixa, a Perplexity-style research assistant. "
    "Answer the user's question using ONLY the provided web sources. "
    "Cite every factual claim inline ONLY as [1], [2] matching the source numbers. "
    "Never use any other citation format: no 【】 brackets, no footnotes. "
    "Use pure Markdown only: never emit HTML tags such as <br>, <div>, <span>. "
    "For line breaks use real newlines, Markdown lists, or separate table rows — "
    "never stuff multiple bullet points into one table cell with <br>. "
    "Choose formatting by content: paragraphs for explanations, bullets for "
    "independent points, numbered lists for procedures, tables ONLY for "
    "genuine comparisons where rows and columns add clarity. Never turn "
    "ordinary prose into tables. "
    "Distinguish evidence levels in wording: state documented facts directly, "
    "attribute vendor claims as 'The vendor reports ...', mark uncertain or "
    "contested points as such, and never present an interpretation as an "
    "established fact. For numeric comparisons, only claim a direct speedup "
    "when model, hardware, and workload match; otherwise state that figures "
    "come from different setups and are not directly comparable. "
    "Write authoritative, direct synthesis. Do NOT include meta-commentary, "
    "editorial side notes, or parenthetical explanations about what sources state "
    "(e.g., never write '*(The Wikipedia entry lists...)*' or 'According to source [1]'). "
    "Let the inline citation chips [1] handle all source attribution. "
    "If the sources don't contain the answer, say so clearly."
)

REWRITE_SYSTEM_PROMPT = (
    "Rewrite the user's follow-up question as a standalone search query. "
    "Resolve pronouns and references (he, she, it, they, this) using the "
    "conversation. Keep names, dates, and constraints from the follow-up. "
    "Return ONLY the rewritten query, no quotes, no explanation."
)

CHAT_SYSTEM_PROMPT = (
    "You are Verixa, a friendly AI chatbot. Answer conversationally from "
    "your own knowledge and the conversation so far. Do not invent citations "
    "or source numbers. If the user asks about something you cannot know "
    "without the live web, say what you can and offer to search for it."
)

ROUTE_SYSTEM_PROMPT = (
    "Classify the user's message. Reply with exactly one word. Reply SEARCH "
    "when the message asks about a specific person, place, event, "
    "organization, statistic, news, or any external fact that should be "
    "verified against the live web. Reply CHAT for greetings, thanks, "
    "goodbyes, small talk, creative writing, opinions, math, "
    "general-knowledge explanations, and follow-ups answerable from the "
    "conversation alone."
)

SMALLTALK_RE = re.compile(
    r"^(hi|hii+|hello|hey+|yo|namaste|thanks|thank you|thx|dhanyabad|"
    r"bye|goodbye|good morning|good afternoon|good evening|good night)"
    r"[\s!.]*$",
    re.IGNORECASE,
)

MAX_HISTORY_TURNS = 4
HISTORY_ANSWER_CHARS = 1200


def normalize_citations(text: str) -> str:
    """Rewrite model-native 【n†...】 markers as [n] chips the UI renders."""
    return NATIVE_CITATION_RE.sub(r"[\1]", text)


def get_llm() -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy .env.example to .env "
            "and add your key from https://console.groq.com."
        )
    return ChatGroq(model="openai/gpt-oss-120b", api_key=api_key)


def format_history(history: list[dict]) -> str:
    """Compact recent turns for prompts. Trimmed to respect token limits."""
    blocks: list[str] = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        q = str(turn.get("query") or "")[:300]
        a = str(turn.get("answer") or "")[:HISTORY_ANSWER_CHARS]
        if q:
            blocks.append(f"User: {q}\nAssistant: {a}")
    return "\n\n".join(blocks)


def rewrite_query(query: str, history: list[dict], llm: ChatGroq) -> str:
    """Resolve a follow-up against thread history into a standalone query."""
    if not history:
        return query
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", REWRITE_SYSTEM_PROMPT),
            (
                "human",
                "Conversation so far:\n{history}\n\nFollow-up: {query}\n\nStandalone query:",
            ),
        ]
    )
    response = (prompt | llm).invoke(
        {"history": format_history(history), "query": query}
    )
    content = response.content if isinstance(response.content, str) else ""
    rewritten = content.strip().strip('"').strip()[:300]
    return rewritten or query


def route_message(query: str, history: list[dict], llm) -> str:
    """Return "chat" when no web search is needed, else "search"."""
    if SMALLTALK_RE.match(query.strip()):
        return "chat"
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", ROUTE_SYSTEM_PROMPT),
                (
                    "human",
                    "Conversation so far:\n{history}\n\nMessage: {query}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {"history": format_history(history), "query": query[:500]}
        )
        content = response.content if isinstance(response.content, str) else ""
        return "chat" if "CHAT" in content.upper() else "search"
    except Exception:
        return "search"


def build_chat_chain(system_extra: str = ""):
    """Direct conversational answers: no search, no citations."""
    system = CHAT_SYSTEM_PROMPT
    if system_extra.strip():
        system += "\n" + system_extra.strip()[:2000]
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "Conversation so far (may be empty):\n{history}\n\nMessage: {query}",
            ),
        ]
    )
    return prompt | get_llm()


def build_context(
    result, max_results: int = DEFAULT_RESULTS, char_cap: int = 1500
) -> tuple[str, list[dict]]:
    blocks: list[str] = []
    sources: list[dict] = []
    for i, item in enumerate(result.results[:max_results], start=1):
        excerpt = (item.highlights or [""])[0][:220]
        sources.append({"id": i, "title": item.title, "url": item.url, "excerpt": excerpt})
        highlights = "\n".join((item.highlights or [])[:2])
        blocks.append(f"[{i}] {item.title}\nURL: {item.url}\n{highlights[:char_cap]}")
    return "\n\n".join(blocks), sources


def build_answer_chain(system_extra: str = ""):
    """LangChain chain: prompt plus Groq chat model for cited answers."""
    system = SYSTEM_PROMPT
    if system_extra.strip():
        system += "\n" + system_extra.strip()[:2000]
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "Conversation so far (may be empty):\n{history}\n\n"
                "Question: {query}\n\nWeb sources:\n{context}\n\n"
                "Write a concise, direct answer with inline citations. "
                "Use Markdown (headings, bold, bullet lists) where it helps readability. "
                "Do not include conversational filler, meta-commentary, or parenthetical source notes.",
            ),
        ]
    )
    return prompt | get_llm()


DEEP_SYNTHESIS_PROMPT = (
    "You are Verixa, a senior research analyst writing a deep-research report. "
    "Answer the user's question using ONLY the provided numbered web sources. "
    "Cite every factual claim inline ONLY as [1], [2] matching the source numbers. "
    "Never use any other citation format: no 【】 brackets, no footnotes. "
    "Use pure Markdown only: never emit HTML tags such as <br>, <div>, <span>. "
    "Structure the report with a short direct answer up front, then sections with "
    "## headings (background, evidence, viewpoints including counter-views, and "
    "outlook or conclusion as fitting). Present competing claims with their "
    "citations side by side instead of picking one silently. When sources "
    "disagree, say so and show both. "
    "Choose formatting by content: paragraphs for explanations, bullets for "
    "independent points, numbered lists for procedures, tables ONLY for "
    "genuine comparisons. A long report needs at most one or two tables; "
    "never convert ordinary prose into tables. "
    "Write authoritative, direct synthesis with no meta-commentary about the "
    "sources themselves. If the sources do not cover part of the question, "
    "say so explicitly rather than filling the gap from general knowledge."
)


def build_deep_answer_chain(system_extra: str = "", draft_feedback: str = ""):
    """LangChain chain for deep-research reports: structured, verified synthesis."""
    system = DEEP_SYNTHESIS_PROMPT
    if system_extra.strip():
        system += "\n" + system_extra.strip()[:2000]
    if draft_feedback.strip():
        system += (
            "\nA fact-check editor reviewed an earlier draft and found these "
            f"unsupported claims; do not repeat them unless the sources support them:\n{draft_feedback[:2000]}"
        )
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system),
            (
                "human",
                "Conversation so far (may be empty):\n{history}\n\n"
                "Research question: {query}\n\nNumbered web sources:\n{context}\n\n"
                "Write the research report with inline citations. "
                "Use Markdown headings, bold, bullet lists, and tables where they help readability.",
            ),
        ]
    )
    return prompt | get_llm()


def load_memory_context(user_id, limit: int = 20) -> tuple[list[str], bool]:
    """Saved memories plus whether auto-learn is on. Empty/off when signed out."""
    if user_id is None:
        return [], False
    from backend.db import session_scope
    from backend.models import Memory, User

    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None or not user.memory_enabled:
            return [], False
        rows = (
            session.query(Memory)
            .filter_by(user_id=user_id)
            .order_by(Memory.created_at.desc())
            .limit(limit)
            .all()
        )
        return [row.content[:500] for row in rows], bool(user.memory_auto)


def load_memories(user_id, limit: int = 20) -> list[str]:
    memories, _ = load_memory_context(user_id, limit)
    return memories


EXTRACT_SYSTEM_PROMPT = (
    "From this user-assistant exchange, extract durable facts about the USER "
    "worth remembering long-term: name, location, work, preferences, goals, "
    "interests. Ignore one-off question topics. Return a JSON array of short "
    "strings (max 15 words each), at most 3. Return [] if nothing is worth "
    "remembering. Return ONLY the JSON array."
)

MAX_MEMORIES = 100


def extract_memories(query: str, answer: str, llm) -> list[str]:
    """Candidate long-term facts from one exchange. Never raises."""
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", EXTRACT_SYSTEM_PROMPT),
                (
                    "human",
                    "User: {query}\nAssistant: {answer}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {"query": query[:1000], "answer": answer[:3000]}
        )
        return _parse_str_list(response, max_items=3, max_len=200)
    except Exception:
        return []


def _parse_str_list(response, max_items: int, max_len: int) -> list[str]:
    """Best-effort JSON string-array extraction from an LLM response."""
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
    out: list[str] = []
    for item in parsed[:max_items]:
        if isinstance(item, str) and item.strip():
            out.append(item.strip()[:max_len])
    return out


RELATED_SYSTEM_PROMPT = (
    "Suggest follow-up questions a curious reader would ask next about this "
    "topic. Return a JSON array of 3 short strings, max 12 words each. "
    "Do not repeat the asked question. Return ONLY the JSON array."
)


def related_questions(query: str, answer: str, llm) -> list[str]:
    """Three related follow-ups for an answer. Never raises."""
    try:
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", RELATED_SYSTEM_PROMPT),
                (
                    "human",
                    "Asked: {query}\nAnswered: {answer}",
                ),
            ]
        )
        response = (prompt | llm).invoke(
            {"query": query[:500], "answer": answer[:2000]}
        )
        out = _parse_str_list(response, max_items=3, max_len=140)
        return [q for q in out if q.lower() != query[:500].lower()]
    except Exception:
        return []


def maybe_learn_memories(
    user_id, query: str, answer: str, llm, auto: bool
) -> None:
    """Persist newly learned facts. Best-effort; never breaks answers."""
    if user_id is None or not auto or not answer.strip():
        return
    try:
        from backend.db import session_scope
        from backend.models import Memory

        candidates = extract_memories(query, answer, llm)
        if not candidates:
            return
        with session_scope() as session:
            existing = [
                row.content
                for row in session.query(Memory)
                .filter_by(user_id=user_id)
                .all()
            ]
            lowered = [e.lower() for e in existing]
            fresh: list[str] = []
            for cand in candidates:
                low = cand.lower()
                if any(low in e or e in low for e in lowered if len(e) > 15 or len(low) > 15):
                    continue
                if low in lowered:
                    continue
                fresh.append(cand)
                lowered.append(low)
            room = MAX_MEMORIES - len(existing)
            for cand in fresh[: max(room, 0)]:
                session.add(Memory(user_id=user_id, content=cand))
    except Exception:
        pass


GENDER_LABELS = {
    "female": "The user identifies as female. Use she/her unless told otherwise.",
    "male": "The user identifies as male. Use he/him unless told otherwise.",
    "nonbinary": "The user identifies as non-binary. Use they/them unless told otherwise.",
}

LENGTH_DIRECTIVES = {
    "short": "Keep the answer short: a few sentences or one compact paragraph.",
    "long": "Give a thorough answer with sections and detail.",
}

FORMAT_DIRECTIVES = {
    "lists": "Prefer bullet or numbered lists over paragraphs where it fits.",
    "paragraph": "Write in flowing paragraphs. Avoid bullet lists unless the user explicitly asks for them.",
}


def build_system_extra(profile: dict | None, memories: list[str]) -> str:
    parts: list[str] = []
    p = profile or {}

    def text(key: str) -> str:
        return str(p.get(key) or "").strip()

    name = text("name")
    instructions = text("instructions")
    occupation = text("occupation")
    company = text("company")
    dob = text("dob")
    gender = text("gender").lower()
    location = text("location")
    if name:
        parts.append(f"The user goes by {name}.")
    if occupation and company:
        parts.append(f"The user works as {occupation} at {company}.")
    elif occupation:
        parts.append(f"The user works as {occupation}.")
    elif company:
        parts.append(f"The user works at {company}.")
    if dob:
        parts.append(f"The user was born on {dob}.")
    if gender in GENDER_LABELS:
        parts.append(GENDER_LABELS[gender])
    if instructions:
        parts.append(f"User preferences for answers: {instructions}")
    if memories:
        parts.append("Things to remember about the user:\n- " + "\n- ".join(memories))
    length = text("response_length").lower()
    if length in LENGTH_DIRECTIVES:
        parts.append(LENGTH_DIRECTIVES[length])
    fmt = text("response_format").lower()
    if fmt in FORMAT_DIRECTIVES:
        parts.append(FORMAT_DIRECTIVES[fmt])
    if p.get("share_location") and location:
        parts.append(
            f"The user is in {location}. Prefer locally relevant results "
            "when the question is location-sensitive."
        )
    return "\n".join(parts)


def resolve_memory_context(user_id, incognito: bool = False) -> tuple[list[str], bool]:
    """Memories plus auto-learn flag, honoring incognito.

    Incognito always yields no memories and no learning, so account data
    can never reach the prompt or be written back.
    """
    if incognito:
        return [], False
    return load_memory_context(user_id)


def answer_query(
    query: str,
    history: list[dict] | None = None,
    profile: dict | None = None,
    num_results: int | None = None,
    user_id=None,
    incognito: bool = False,
) -> dict:
    """Search Exa, then synthesize a cited answer with LangChain + Groq."""
    history = history or []
    count = num_results or DEFAULT_RESULTS
    llm = get_llm()
    memories, auto_learn = resolve_memory_context(user_id, incognito)
    extra = build_system_extra(profile, memories)

    if route_message(query, history, llm) == "chat":
        response = build_chat_chain(extra).invoke(
            {"history": format_history(history), "query": query}
        )
        content = response.content if isinstance(response.content, str) else ""
        maybe_learn_memories(user_id, query, content, llm, auto_learn)
        return {
            "answer": content,
            "sources": [],
            "query": query,
            "mode": "chat",
            "related": related_questions(query, content, llm),
        }

    standalone = rewrite_query(query, history, llm)
    result = web_search(standalone, num_results=count)
    context, sources = build_context(result, max_results=count)

    chain = build_answer_chain(extra)
    response = chain.invoke(
        {
            "history": format_history(history),
            "query": query,
            "context": context,
        }
    )
    content = response.content if isinstance(response.content, str) else ""
    maybe_learn_memories(user_id, query, content, llm, auto_learn)
    return {
        "answer": normalize_citations(content),
        "sources": sources,
        "query": standalone,
        "mode": "search",
        "related": related_questions(query, content, llm),
    }
