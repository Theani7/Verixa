"""Legacy alias for backend.search."""

from backend.clients import get_exa_client as get_client
from backend.search import format_results, get_page_texts, web_search, main

__all__ = ["get_client", "web_search", "get_page_texts", "format_results", "main"]

if __name__ == "__main__":
    raise SystemExit(main())
