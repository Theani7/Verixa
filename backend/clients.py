"""Centralized client factory for external API services (Groq LLM, Exa search)."""

import os
from dotenv import load_dotenv
from exa_py import Exa
from langchain_groq import ChatGroq

load_dotenv()

_llm: ChatGroq | None = None
_exa: Exa | None = None


def get_llm(model: str = "openai/gpt-oss-120b", timeout: float = 90.0) -> ChatGroq:
    """Shared ChatGroq client. Created once per process; safe to call often."""
    global _llm
    if _llm is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Copy .env.example to .env "
                "and add your key from https://console.groq.com."
            )
        _llm = ChatGroq(
            model=model,
            api_key=api_key,
            timeout=timeout,
        )
    return _llm


def get_exa_client() -> Exa:
    """Shared Exa search client."""
    global _exa
    if _exa is None:
        api_key = os.getenv("EXA_API_KEY")
        if not api_key:
            raise RuntimeError(
                "EXA_API_KEY is not set. Copy .env.example to .env "
                "and add your key from https://exa.ai, or export EXA_API_KEY."
            )
        _exa = Exa(api_key=api_key)
    return _exa
