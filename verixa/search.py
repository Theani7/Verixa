"""Web search tool built on the Exa /search endpoint.

Canonical reference: build-with-exa skill (Exa API).
Uses the recommended request shape only — query + type auto +
contents highlights — with no extra filters unless the caller
explicitly passes them.
"""

import os
import sys

from dotenv import load_dotenv
from exa_py import Exa

load_dotenv()


def get_client() -> Exa:
    api_key = os.getenv("EXA_API_KEY")
    if not api_key:
        raise RuntimeError(
            "EXA_API_KEY is not set. Copy .env.example to .env "
            "and add your key from https://exa.ai, or export EXA_API_KEY."
        )
    return Exa(api_key=api_key)


def web_search(query: str, num_results: int | None = None):
    """Run a semantic web search via Exa and return result items.

    Args:
        query: Natural-language query, e.g. "latest developments in LLMs".
        num_results: Result count override. Omitted unless the caller makes
            it an intentional product decision (e.g. a user preference).

    Returns:
        The Exa SearchResponse with .results (title, url, highlights, ...).
    """
    client = get_client()
    kwargs: dict = {
        "type": "auto",
        "contents": {"highlights": True},
    }
    if num_results is not None:
        kwargs["num_results"] = num_results
    return client.search(query, **kwargs)


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
        print('Usage: python -m verixa.search "your query here"')
        return 2
    result = web_search(" ".join(argv))
    print(format_results(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
