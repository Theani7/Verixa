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

# Model-native grounding markers (e.g. 【2†L1-L9】 or bare 【1】).
NATIVE_CITATION_RE = re.compile(r"【(\d+)(?:[†‡][^】]*)?】")

SYSTEM_PROMPT = (
    "You are Verixa, a Perplexity-style research assistant. "
    "Answer the user's question using ONLY the provided web sources. "
    "Cite every factual claim inline ONLY as [1], [2] matching the source numbers. "
    "Never use any other citation format: no 【】 brackets, no footnotes. "
    "If the sources don't contain the answer, say so clearly."
)

REWRITE_SYSTEM_PROMPT = (
    "Rewrite the user's follow-up question as a standalone search query. "
    "Resolve pronouns and references (he, she, it, they, this) using the "
    "conversation. Keep names, dates, and constraints from the follow-up. "
    "Return ONLY the rewritten query, no quotes, no explanation."
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


def build_context(result, max_results: int = 5) -> tuple[str, list[dict]]:
    blocks: list[str] = []
    sources: list[dict] = []
    for i, item in enumerate(result.results[:max_results], start=1):
        excerpt = (item.highlights or [""])[0][:220]
        sources.append({"id": i, "title": item.title, "url": item.url, "excerpt": excerpt})
        highlights = "\n".join((item.highlights or [])[:2])
        blocks.append(f"[{i}] {item.title}\nURL: {item.url}\n{highlights[:1500]}")
    return "\n\n".join(blocks), sources


def build_answer_chain():
    """LangChain chain: prompt plus Groq chat model for cited answers."""
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            (
                "human",
                "Conversation so far (may be empty):\n{history}\n\n"
                "Question: {query}\n\nWeb sources:\n{context}\n\n"
                "Write a concise answer with inline citations. "
                "Use Markdown (headings, bold, bullet lists) where it helps readability.",
            ),
        ]
    )
    return prompt | get_llm()


def answer_query(query: str, history: list[dict] | None = None) -> dict:
    """Search Exa, then synthesize a cited answer with LangChain + Groq."""
    history = history or []
    llm = get_llm()
    standalone = rewrite_query(query, history, llm)
    result = web_search(standalone)
    context, sources = build_context(result)

    chain = build_answer_chain()
    response = chain.invoke(
        {
            "history": format_history(history),
            "query": query,
            "context": context,
        }
    )
    content = response.content if isinstance(response.content, str) else ""
    return {
        "answer": normalize_citations(content),
        "sources": sources,
        "query": standalone,
    }
