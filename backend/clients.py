"""Centralized client factory for external API services (Groq LLM, Exa search)."""

import os
from dotenv import load_dotenv
from exa_py import Exa
from langchain_groq import ChatGroq

load_dotenv()

from backend.config import settings

_llm: ChatGroq | None = None
_exa: Exa | None = None


def get_llm(model: str | None = None, timeout: float = 90.0) -> ChatGroq:
    """Shared ChatGroq client. Created once per process; safe to call often."""
    global _llm
    if _llm is None:
        api_key = settings.groq_api_key
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Copy .env.example to .env "
                "and add your key from https://console.groq.com."
            )
        _llm = ChatGroq(
            model=model or settings.groq_model,
            api_key=api_key,
            timeout=timeout,
        )
    return _llm


def get_exa_client() -> Exa:
    """Shared Exa search client."""
    global _exa
    if _exa is None:
        api_key = settings.exa_api_key
        if not api_key:
            raise RuntimeError(
                "EXA_API_KEY is not set. Copy .env.example to .env "
                "and add your key from https://exa.ai, or export EXA_API_KEY."
            )
        _exa = Exa(api_key=api_key)
    return _exa

