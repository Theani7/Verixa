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
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    exa_api_key: str = os.getenv("EXA_API_KEY", "")
    groq_tpm_limit: int = int(os.getenv("GROQ_TPM_LIMIT", "8000"))
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


settings = Settings()
