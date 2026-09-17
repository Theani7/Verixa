"""FastAPI entrypoint for the Verixa Perplexity clone."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.auth import (
    check_password,
    create_token,
    hash_password,
    user_id_from_header,
    valid_email,
    valid_password,
)
from backend.chain import answer_query
from backend.db import init_db, session_scope
from backend.models import User
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


class AskRequest(BaseModel):
    query: str
    history: list[HistoryTurn] = []


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


class MeResponse(BaseModel):
    id: str
    email: str


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/ask")
def ask(req: AskRequest) -> dict:
    return answer_query(req.query, [t.model_dump() for t in req.history])


@app.post("/api/ask/stream")
def ask_stream(req: AskRequest) -> StreamingResponse:
    return StreamingResponse(
        event_stream(req.query, [t.model_dump() for t in req.history]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(req: AuthRequest) -> dict:
    email, password = _credentials(req)
    with session_scope() as session:
        if session.query(User).filter_by(email=email).first() is not None:
            raise HTTPException(
                status_code=409, detail="An account with this email already exists."
            )
        user = User(email=email, password_hash=hash_password(password))
        session.add(user)
        session.flush()
        token = create_token(user.id)
        return {"token": token, "id": str(user.id), "email": user.email}


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
        return {"token": token, "id": str(user.id), "email": user.email}


@app.get("/api/me", response_model=MeResponse)
def me(authorization: str | None = Header(default=None)) -> dict:
    user_id = user_id_from_header(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        return {"id": str(user.id), "email": user.email}
