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

    resolved_model = settings.get_model(model)
    provider = settings.effective_llm_provider

    if provider == "ollama":
        from langchain_openai import ChatOpenAI

        _llm = ChatOpenAI(
            base_url=settings.ollama_base_url,
            model=resolved_model,
            api_key="ollama",
            timeout=timeout,
        )
    elif provider in ("openai", "custom"):
        from langchain_openai import ChatOpenAI

        api_key = settings.openai_api_key or "not-needed"
        if not settings.openai_api_key and not settings.openai_base_url:
            raise RuntimeError(
                "OPENAI_API_KEY or OPENAI_BASE_URL is required when using the OpenAI provider. "
                "Set OPENAI_API_KEY in .env, or provide OPENAI_BASE_URL for a local compatible endpoint."
            )
        kwargs = {
            "model": resolved_model,
            "api_key": api_key,
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
            model=resolved_model,
            api_key=api_key,
            timeout=timeout,
        )

    return _llm


def create_custom_llm(
    config: dict | None = None,
    timeout: float = 90.0,
) -> BaseChatModel:
    """Create or return an LLM instance tailored for a specific request.

    If config is empty or provider is 'default', the server's default shared LLM is returned.
    Otherwise, instantiates the requested provider (anthropic, openrouter, openai, ollama, groq, custom).
    """
    if not config:
        return get_llm(timeout=timeout)

    provider = str(config.get("provider") or "default").strip().lower()
    if provider in ("default", ""):
        return get_llm(model=config.get("model"), timeout=timeout)

    model = config.get("model") or None
    api_key = config.get("api_key") or None
    base_url = config.get("base_url") or None

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            raise RuntimeError(
                "Anthropic API key is required. Please provide it in Settings > Model & Sources or set ANTHROPIC_API_KEY."
            )
        target_model = model or os.getenv("ANTHROPIC_MODEL") or settings.get_model()
        if not target_model:
            raise RuntimeError(
                "Model name is required for Anthropic. Please specify it in Settings or ANTHROPIC_MODEL."
            )
        return ChatAnthropic(
            model=target_model,
            api_key=key,
            timeout=timeout,
        )

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        key = api_key or os.getenv("OPENROUTER_API_KEY", "")
        if not key:
            raise RuntimeError(
                "OpenRouter API key is required. Please provide it in Settings > Model & Sources or set OPENROUTER_API_KEY."
            )
        target_model = model or os.getenv("OPENROUTER_MODEL") or settings.get_model()
        if not target_model:
            raise RuntimeError(
                "Model name is required for OpenRouter. Please specify it in Settings or OPENROUTER_MODEL."
            )
        return ChatOpenAI(
            base_url=base_url or os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            model=target_model,
            api_key=key,
            timeout=timeout,
        )

    if provider in ("openai", "custom"):
        from langchain_openai import ChatOpenAI

        key = api_key or settings.openai_api_key or "not-needed"
        kwargs = {
            "model": model or settings.get_model(),
            "api_key": key,
            "timeout": timeout,
        }
        target_url = base_url or settings.openai_base_url
        if target_url:
            kwargs["base_url"] = target_url
        return ChatOpenAI(**kwargs)

    if provider == "ollama":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url=base_url or settings.ollama_base_url,
            model=model or settings.get_model(),
            api_key="ollama",
            timeout=timeout,
        )

    if provider == "groq":
        key = api_key or settings.groq_api_key
        if not key:
            raise RuntimeError(
                "GROQ API key is required. Please provide it in Settings > Model & API or set GROQ_API_KEY."
            )
        return ChatGroq(
            model=model or settings.get_model(),
            api_key=key,
            timeout=timeout,
        )

    return get_llm(model=model, timeout=timeout)


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


