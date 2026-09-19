"""Web search service built on the Exa API."""

import sys
from backend.clients import get_exa_client

_DEFAULT_CONTENTS: dict = {
    "highlights": True,
    "text": {"max_characters": 2000},
}


def web_search(
    query: str,
    num_results: int | None = None,
    contents: dict | None = None,
):
    """Run a semantic web search via Exa and return result items.

    Args:
        query: Natural-language query.
        num_results: Result count override.
        contents: Exa contents options override.

    Returns:
        The Exa SearchResponse with .results (title, url, highlights, ...).
    """
    client = get_exa_client()
    kwargs: dict = {
        "type": "auto",
        "contents": contents if contents is not None else _DEFAULT_CONTENTS,
    }
    if num_results is not None:
        kwargs["num_results"] = num_results
    return client.search(query, **kwargs)


def get_page_texts(urls: list[str], max_chars: int = 4000) -> dict[str, str]:
    """Fetch full page text for URLs via Exa /contents. Never raises."""
    cleaned: dict[str, str] = {}
    urls = [u for u in urls if u]
    if not urls:
        return cleaned
    try:
        client = get_exa_client()
        response = client.get_contents(
            urls,
            text={"max_characters": max_chars},
        )
    except Exception:
        return cleaned
    for item in getattr(response, "results", []) or []:
        url = getattr(item, "url", "") or ""
        text = getattr(item, "text", "") or ""
        if url and text:
            cleaned[url] = text[:max_chars]
    return cleaned


def format_results(result) -> str:
    lines = []
    for i, item in enumerate(result.results, start=1):
        lines.append(f"{i}. {item.title}\n   {item.url}")
        for h in item.highlights or []:
            lines.append(f"   - {h}")
    return "\n".join(lines) if lines else "No results."


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print('Usage: python -m backend.search "your query here"')
        return 2
    result = web_search(" ".join(argv))
    print(format_results(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
