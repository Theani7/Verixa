"""Centralized client factory for external API services (Groq LLM, Exa search)."""

import os
from dotenv import load_dotenv
from exa_py import Exa
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_groq import ChatGroq

load_dotenv()

from backend.config import settings

_llm: BaseChatModel | None = None
_exa: Exa | None = None


def get_llm(model: str | None = None, timeout: float = 90.0) -> BaseChatModel:
    """Shared LLM client supporting Groq, Ollama, and OpenAI/compatible providers."""
    global _llm
    if _llm is not None:
        return _llm

    provider = settings.llm_provider
    if provider == "ollama":
        from langchain_openai import ChatOpenAI

        _llm = ChatOpenAI(
            base_url=settings.ollama_base_url,
            model=model or settings.ollama_model,
            api_key="ollama",
            timeout=timeout,
        )
    elif provider in ("openai", "custom"):
        from langchain_openai import ChatOpenAI

        api_key = settings.openai_api_key
        if not api_key and not settings.openai_base_url:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Please provide your API key in .env "
                "or configure OPENAI_BASE_URL for a local compatible endpoint."
            )
        kwargs = {
            "model": model or settings.openai_model,
            "api_key": api_key or "not-needed",
            "timeout": timeout,
        }
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _llm = ChatOpenAI(**kwargs)
    else:
        # Default: Groq
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

