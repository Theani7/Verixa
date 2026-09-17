"""FastAPI entrypoint for the Verixa Perplexity clone."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.chain import answer_query
from backend.db import init_db
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
def put_thread(thread_id: str, req: ThreadSave) -> dict:
    if not valid_id(thread_id):
        raise HTTPException(status_code=400, detail="Invalid thread id.")
    turns = clean_turns(req.turns)
    if turns is None:
        raise HTTPException(status_code=400, detail="Invalid turns payload.")
    save_thread(thread_id, req.title, turns)
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
def remove_thread(thread_id: str) -> dict:
    if not valid_id(thread_id):
        raise HTTPException(status_code=400, detail="Invalid thread id.")
    delete_thread(thread_id)
    return {"id": thread_id}
