"""FastAPI entrypoint for the Verixa Perplexity clone."""

import re
import uuid
from typing import Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func

from backend.auth import (
    base_username,
    check_password,
    create_token,
    hash_password,
    user_id_from_header,
    valid_email,
    valid_password,
    valid_username,
)
from backend.chain import answer_query
from backend.db import init_db, session_scope
from backend.models import Memory, User
from backend.streaming import event_stream
from backend.threads import clean_turns, delete_thread, get_thread, save_thread, valid_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Verixa API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HistoryTurn(BaseModel):
    query: str
    answer: str = ""
    mode: str | None = None


def _validate_history_mode(history: list[HistoryTurn], target_mode: str) -> None:
    for t in history:
        if not t.mode:
            continue
        hist_mode = "deep" if t.mode == "deep" else "search"
        curr_mode = "deep" if target_mode == "deep" else "search"
        if hist_mode != curr_mode:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot switch modes in an active chat. This chat was started in {hist_mode} mode. Please start a new chat to use {curr_mode} mode.",
            )


class CustomLLMConfig(BaseModel):
    provider: str = "default"
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


class AskRequest(BaseModel):
    query: str
    history: list[HistoryTurn] = []
    num_results: int | None = Field(default=None, ge=1, le=50)
    profile: dict = Field(default_factory=dict)
    mode: Literal["search", "deep"] = "search"
    incognito: bool = False
    custom_llm: CustomLLMConfig | None = None



class ThreadSave(BaseModel):
    title: str
    turns: list[dict]


class AuthRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    id: str
    email: str
    full_name: str = ""
    username: str = ""


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    username: str
    created_at: str
    memory_enabled: bool
    memory_auto: bool


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    username: str | None = Field(default=None, max_length=30)
    memory_enabled: bool | None = None
    memory_auto: bool | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


GENDERS = {"female", "male", "nonbinary", "prefer_not_to_say"}
LENGTHS = {"short", "default", "long"}
FORMATS = {"lists", "default", "paragraph"}
DOB_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _clean_profile(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {}

    def text(key: str, limit: int) -> str:
        return str(raw.get(key) or "").strip()[:limit]

    gender = text("gender", 20).lower()
    length = text("response_length", 10).lower() or "default"
    fmt = text("response_format", 10).lower() or "default"
    dob = text("dob", 10)
    return {
        "name": text("name", 100),
        "instructions": text("instructions", 2000),
        "occupation": text("occupation", 120),
        "company": text("company", 120),
        "dob": dob if DOB_RE.match(dob) else "",
        "gender": gender if gender in GENDERS else "",
        "share_location": bool(raw.get("share_location", False)),
        "location": text("location", 120),
        "response_length": length if length in LENGTHS else "default",
        "response_format": fmt if fmt in FORMATS else "default",
    }


def _require_user(authorization: str | None):
    user_id = user_id_from_header(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        return user


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/ask")
def ask(
    req: AskRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    _validate_history_mode(req.history, req.mode)
    user_id = None if req.incognito else user_id_from_header(authorization)
    custom_llm_dict = req.custom_llm.model_dump() if req.custom_llm else None
    from backend.clients import create_custom_llm
    llm = create_custom_llm(custom_llm_dict)

    if req.mode == "deep":
        from backend.deep import deep_answer

        return deep_answer(
            req.query,
            [t.model_dump() for t in req.history],
            profile=_clean_profile(req.profile),
            user_id=user_id,
            incognito=req.incognito,
            llm=llm,
        )
    return answer_query(
        req.query,
        [t.model_dump() for t in req.history],
        profile=_clean_profile(req.profile),
        num_results=req.num_results,
        user_id=user_id,
        incognito=req.incognito,
        llm=llm,
    )


@app.post("/api/ask/stream")
def ask_stream(
    req: AskRequest,
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    _validate_history_mode(req.history, req.mode)
    custom_llm_dict = req.custom_llm.model_dump() if req.custom_llm else None
    return StreamingResponse(
        event_stream(
            req.query,
            [t.model_dump() for t in req.history],
            profile=_clean_profile(req.profile),
            num_results=req.num_results,
            user_id=None if req.incognito else user_id_from_header(authorization),
            mode=req.mode,
            incognito=req.incognito,
            custom_llm=custom_llm_dict,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/llm/test")
def test_llm_connection(req: CustomLLMConfig) -> dict:
    try:
        from backend.clients import create_custom_llm

        llm = create_custom_llm(req.model_dump())
        resp = llm.invoke("Hi")
        answer = str(resp.content).strip() if resp and resp.content else "OK"
        return {"ok": True, "message": f"Connected successfully! Response: {answer[:40]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.put("/api/threads/{thread_id}")
def put_thread(
    thread_id: str,
    req: ThreadSave,
    authorization: str | None = Header(default=None),
) -> dict:
    if not valid_id(thread_id):
        raise HTTPException(status_code=400, detail="Invalid thread id.")
    turns = clean_turns(req.turns)
    if turns is None:
        raise HTTPException(status_code=400, detail="Invalid turns payload.")
    result = save_thread(
        thread_id, req.title, turns, user_id_from_header(authorization)
    )
    if result == "forbidden":
        raise HTTPException(status_code=403, detail="Thread belongs to another account.")
    return {"id": thread_id}


@app.get("/api/threads/{thread_id}")
def read_thread(thread_id: str) -> dict:
    if not valid_id(thread_id):
        raise HTTPException(status_code=404, detail="Thread not found.")
    thread = get_thread(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return thread


@app.delete("/api/threads/{thread_id}")
def remove_thread(
    thread_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    if not valid_id(thread_id):
        raise HTTPException(status_code=400, detail="Invalid thread id.")
    result = delete_thread(thread_id, user_id_from_header(authorization))
    if result == "forbidden":
        raise HTTPException(status_code=403, detail="Thread belongs to another account.")
    return {"id": thread_id}


def _credentials(req: AuthRequest) -> tuple[str, str]:
    email = req.email.strip().lower()
    if not valid_email(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if not valid_password(req.password):
        raise HTTPException(
            status_code=400, detail="Password must be 8 to 72 characters."
        )
    return email, req.password


def _unique_username(session, email: str) -> str:
    """Email-based username, suffixed with random digits until unique."""
    import random

    base = base_username(email)
    candidate = base
    for _ in range(20):
        if (
            session.query(User)
            .filter(func.lower(User.username) == candidate.lower())
            .first()
            is None
        ):
            return candidate
        candidate = f"{base}{random.randint(1, 9999)}"[:20]
    return f"{base}{uuid.uuid4().hex[:6]}"[:20]


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(req: AuthRequest) -> dict:
    email, password = _credentials(req)
    with session_scope() as session:
        if session.query(User).filter_by(email=email).first() is not None:
            raise HTTPException(
                status_code=409, detail="An account with this email already exists."
            )
        username = _unique_username(session, email)
        user = User(email=email, password_hash=hash_password(password), username=username)
        session.add(user)
        session.flush()
        token = create_token(user.id)
        return {
            "token": token,
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name or "",
            "username": user.username or "",
        }


@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: AuthRequest) -> dict:
    email, password = _credentials(req)
    with session_scope() as session:
        user = session.query(User).filter_by(email=email).first()
        if (
            user is None
            or user.password_hash is None
            or not check_password(password, user.password_hash)
        ):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = create_token(user.id)
        return {
            "token": token,
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name or "",
            "username": user.username or "",
        }


@app.get("/api/me", response_model=MeResponse)
def me(authorization: str | None = Header(default=None)) -> dict:
    user = _require_user(authorization)
    return _me_dict(user)


def _me_dict(user) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name or "",
        "username": user.username or "",
        "created_at": user.created_at.isoformat(),
        "memory_enabled": bool(user.memory_enabled),
        "memory_auto": bool(user.memory_auto),
    }


@app.put("/api/me", response_model=MeResponse)
def update_me(
    req: ProfileUpdate,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    with session_scope() as session:
        row = session.get(User, user.id)
        if row is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        if req.username is not None:
            username = req.username.strip()
            if username and not valid_username(username):
                raise HTTPException(
                    status_code=400,
                    detail="Username must be 3 to 20 letters, numbers, or underscores.",
                )
            if username:
                taken = (
                    session.query(User)
                    .filter(func.lower(User.username) == username.lower(), User.id != row.id)
                    .first()
                )
                if taken is not None:
                    raise HTTPException(
                        status_code=409, detail="That username is already taken."
                    )
                row.username = username
            else:
                row.username = None
        if req.full_name is not None:
            row.full_name = req.full_name.strip()[:120]
        if req.memory_enabled is not None:
            row.memory_enabled = req.memory_enabled
        if req.memory_auto is not None:
            row.memory_auto = req.memory_auto
        session.flush()
        return _me_dict(row)


@app.put("/api/auth/password")
def change_password(
    req: PasswordChange,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    with session_scope() as session:
        row = session.get(User, user.id)
        if (
            row is None
            or row.password_hash is None
            or not check_password(req.current_password, row.password_hash)
        ):
            raise HTTPException(status_code=401, detail="Current password is wrong.")
        if not valid_password(req.new_password):
            raise HTTPException(
                status_code=400, detail="New password must be 8 to 72 characters."
            )
        row.password_hash = hash_password(req.new_password)
    return {"ok": True}


@app.delete("/api/me")
def delete_account(authorization: str | None = Header(default=None)) -> dict:
    user = _require_user(authorization)
    with session_scope() as session:
        row = session.get(User, user.id)
        if row is not None:
            session.delete(row)
    return {"ok": True}


@app.get("/api/memories")
def list_memories(authorization: str | None = Header(default=None)) -> dict:
    user = _require_user(authorization)
    with session_scope() as session:
        rows = (
            session.query(Memory)
            .filter_by(user_id=user.id)
            .order_by(Memory.created_at.desc())
            .limit(100)
            .all()
        )
        return {
            "memories": [
                {
                    "id": str(row.id),
                    "content": row.content,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
        }


@app.post("/api/memories")
def add_memory(
    req: MemoryCreate,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    with session_scope() as session:
        count = session.query(Memory).filter_by(user_id=user.id).count()
        if count >= 100:
            raise HTTPException(
                status_code=400, detail="Memory is full (100 items max)."
            )
        row = Memory(user_id=user.id, content=req.content.strip())
        session.add(row)
        session.flush()
        return {
            "id": str(row.id),
            "content": row.content,
            "created_at": row.created_at.isoformat(),
        }


@app.delete("/api/memories/{memory_id}")
def remove_memory(
    memory_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _require_user(authorization)
    with session_scope() as session:
        try:
            import uuid as uuid_lib

            key = uuid_lib.UUID(memory_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Memory not found.")
        row = session.get(Memory, key)
        if row is None or row.user_id != user.id:
            raise HTTPException(status_code=404, detail="Memory not found.")
        session.delete(row)
    return {"ok": True}
