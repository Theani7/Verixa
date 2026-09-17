"""Password hashing and JWT sessions for Verixa accounts."""

import os
import re
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
TOKEN_DAYS = 7
MIN_PASSWORD = 8
MAX_PASSWORD = 72

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")


def valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email.strip()))


def valid_username(username: str) -> bool:
    return bool(USERNAME_RE.match(username))


def valid_password(password: str) -> bool:
    return MIN_PASSWORD <= len(password.encode()) <= MAX_PASSWORD


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=TOKEN_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def user_id_from_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return uuid.UUID(str(payload.get("sub")))
    except (jwt.PyJWTError, ValueError, AttributeError):
        return None


def user_id_from_header(authorization: str | None) -> uuid.UUID | None:
    """Best-effort auth for optional-auth endpoints. Never raises."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return user_id_from_token(authorization.removeprefix("Bearer ").strip())
