"""Answer synthesis with LangChain + Groq over Exa search results.

Per build-with-exa skill:
- Retrieval uses /search with the recommended request only
  (query + type auto + contents highlights).
- This app HAS its own chat LLM (ChatGroq via LangChain), so we give
  it /search results as context instead of calling /answer.
"""

import os

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

from seekora.search import web_search

load_dotenv()

SYSTEM_PROMPT = (
    "You are Seekora, a Perplexity-style research assistant. "
    "Answer the user's question using ONLY the provided web sources. "
    "Cite every factual claim inline like [1], [2] matching the source numbers. "
    "If the sources don't contain the answer, say so clearly."
)


def get_llm() -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy .env.example to .env "
            "and add your key from https://console.groq.com."
        )
    return ChatGroq(model="openai/gpt-oss-120b", api_key=api_key)


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
                "Question: {query}\n\nWeb sources:\n{context}\n\n"
                "Write a concise answer with inline citations. "
                "Use Markdown (headings, bold, bullet lists) where it helps readability.",
            ),
        ]
    )
    return prompt | get_llm()


def answer_query(query: str) -> dict:
    """Search Exa, then synthesize a cited answer with LangChain + Groq."""
    result = web_search(query)
    context, sources = build_context(result)

    chain = build_answer_chain()
    response = chain.invoke({"query": query, "context": context})
    return {"answer": response.content, "sources": sources}
