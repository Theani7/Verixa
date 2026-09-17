"""FastAPI entrypoint for the Verixa Perplexity clone."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.chain import answer_query
from backend.streaming import event_stream

app = FastAPI(title="Verixa API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    query: str


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/ask")
def ask(req: AskRequest) -> dict:
    return answer_query(req.query)


@app.post("/api/ask/stream")
def ask_stream(req: AskRequest) -> StreamingResponse:
    return StreamingResponse(
        event_stream(req.query),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
