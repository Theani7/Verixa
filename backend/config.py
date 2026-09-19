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
    # Provider selection
    llm_provider: str = os.getenv("LLM_PROVIDER", "groq").lower()

    # Groq configuration
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_tpm_limit: int = int(os.getenv("GROQ_TPM_LIMIT", "8000"))
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    # Ollama / Local LLM configuration
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3")

    # OpenAI / Compatible provider configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Search configuration
    exa_api_key: str = os.getenv("EXA_API_KEY", "")


settings = Settings()

