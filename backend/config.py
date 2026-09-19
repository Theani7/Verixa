"""Central application configuration and environment settings."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://verixa:verixa@localhost:5432/verixa"
    )
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    token_days: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))
    # Provider and model configuration (loaded from .env)
    llm_provider: str = os.getenv("LLM_PROVIDER", "groq").lower()
    model_name: str = os.getenv("MODEL_NAME") or os.getenv("LLM_MODEL") or ""

    # Groq configuration
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_tpm_limit: int = int(os.getenv("GROQ_TPM_LIMIT", "8000"))
    groq_model: str = os.getenv("GROQ_MODEL", "")

    # Ollama / Local LLM configuration
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "")

    # OpenAI / Compatible provider configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "")

    # OpenRouter configuration
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_base_url: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "")

    # Anthropic configuration
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "")

    # Search configuration
    exa_api_key: str = os.getenv("EXA_API_KEY", "")

    @property
    def effective_llm_provider(self) -> str:
        provider = self.llm_provider.strip().lower()
        if provider and provider not in ("auto", "default"):
            return provider
        if self.openrouter_api_key and not self.groq_api_key:
            return "openrouter"
        if self.anthropic_api_key and not self.groq_api_key:
            return "anthropic"
        if self.openai_base_url or (self.openai_api_key and not self.groq_api_key):
            return "openai"
        if self.groq_api_key:
            return "groq"
        if self.openai_api_key:
            return "openai"
        if self.openrouter_api_key:
            return "openrouter"
        if self.anthropic_api_key:
            return "anthropic"
        return "groq"

    def get_model(self, override: str | None = None) -> str:
        """Resolve model name strictly from environment variables without hardcoded defaults."""
        if override:
            return override
        if self.model_name:
            return self.model_name

        provider = self.effective_llm_provider
        if provider == "ollama":
            model = self.ollama_model
            if not model:
                raise RuntimeError(
                    "OLLAMA_MODEL or MODEL_NAME is not set in .env. "
                    "Please specify the model name to use with Ollama."
                )
            return model
        elif provider == "openrouter":
            model = self.openrouter_model
            if not model:
                raise RuntimeError(
                    "OPENROUTER_MODEL or MODEL_NAME is not set in .env. "
                    "Please specify the model name to use with OpenRouter."
                )
            return model
        elif provider == "anthropic":
            model = self.anthropic_model
            if not model:
                raise RuntimeError(
                    "ANTHROPIC_MODEL or MODEL_NAME is not set in .env. "
                    "Please specify the model name to use with Anthropic."
                )
            return model
        elif provider in ("openai", "custom"):
            model = self.openai_model
            if not model:
                raise RuntimeError(
                    "OPENAI_MODEL or MODEL_NAME is not set in .env. "
                    "Please specify the model name to use with OpenAI or compatible endpoint."
                )
            return model
        else:
            model = self.groq_model
            if not model:
                raise RuntimeError(
                    "GROQ_MODEL or MODEL_NAME is not set in .env. "
                    "Please set GROQ_MODEL=<your-model> in your .env file."
                )
            return model


settings = Settings()


