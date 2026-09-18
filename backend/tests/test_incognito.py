"""Tests for incognito mode plumbing (no network, no LLM)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.main import AskRequest
from backend import chain, deep, streaming


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" " + extra if extra else ""))
    if not cond:
        check.failed += 1
check.failed = 0


def t1_request_flag():
    req = AskRequest(query="hi")
    check("T1 default off", req.incognito is False)
    req2 = AskRequest(query="hi", incognito=True)
    check("T1 flag accepted", req2.incognito is True)


def t2_signatures():
    import inspect

    for fn, label in (
        (chain.answer_query, "answer_query"),
        (deep.deep_answer, "deep_answer"),
        (streaming.event_stream, "event_stream"),
        (deep.synthesize_report, "synthesize_report"),
        (deep.verify_report, "verify_report"),
    ):
        params = inspect.signature(fn).parameters
        check(f"T2 {label} accepts incognito/redact", (
            "incognito" in params or "redact_query" in params
        ))


def t3_no_memory_use():
    """Incognito must not load memories (privacy) even when signed in."""
    called = {"load": 0}

    def fake_load(user_id):
        called["load"] += 1
        return ["secret memory"], True

    saved = {
        "resolve": deep.resolve_memory_context,
        "decompose": deep.decompose,
        "collect": deep.collect_round,
        "reflect": deep.reflect_gaps,
        "synth": deep.synthesize_report,
        "learn": deep.maybe_learn_memories,
        "related": deep.related_questions,
    }
    # Patch the names deep.py actually calls (imported into its namespace).
    deep.resolve_memory_context = fake_load
    deep.decompose = lambda q, h, llm, count=None: ["q1"]
    deep.collect_round = lambda *a, **k: ("ctx", [], [], "")
    deep.reflect_gaps = lambda *a, **k: []
    deep.synthesize_report = lambda *a, **k: ("answer", {})
    deep.maybe_learn_memories = lambda *a, **k: None
    deep.related_questions = lambda *a, **k: []
    try:
        deep.deep_answer("q", [], {}, "user-1", None, incognito=True)
        check("T3 incognito skips memory load", called["load"] == 0,
              f"loads={called['load']}")
        deep.deep_answer("q", [], {}, "user-1", None, incognito=False)
        check("T3 normal loads memory", called["load"] == 1,
              f"loads={called['load']}")
    finally:
        deep.load_memory_context = saved["load"]
        deep.decompose = saved["decompose"]
        deep.collect_round = saved["collect"]
        deep.reflect_gaps = saved["reflect"]
        deep.synthesize_report = saved["synth"]
        deep.maybe_learn_memories = saved["learn"]
        deep.related_questions = saved["related"]


def t4_stream_skips_learning():
    """Streaming deep path must not learn memories in incognito."""
    import asyncio

    calls = {"learn": 0}
    orig_load = streaming.load_memory_context
    orig_learn = streaming.maybe_learn_memories
    orig_decompose = streaming.decompose
    orig_collect = streaming.collect_round
    orig_reflect = streaming.reflect_gaps
    orig_synth = streaming.synthesize_report
    orig_llm = streaming.get_llm
    orig_related = streaming.related_questions
    orig_route = streaming.route_message

    class FakeLLM:
        pass

    load_calls: list = []

    def fake_load(uid):
        load_calls.append(uid)
        return ["mem"], True

    streaming.load_memory_context = fake_load
    seen_auto: list = []

    def fake_learn(user_id, query, answer, llm, auto):
        seen_auto.append(bool(auto))

    streaming.maybe_learn_memories = fake_learn
    streaming.decompose = lambda *a, **k: ["q1"]
    streaming.collect_round = lambda *a, **k: ("ctx", [], [], "")
    streaming.reflect_gaps = lambda *a, **k: []
    streaming.synthesize_report = lambda *a, **k: ("answer", {})
    streaming.get_llm = lambda: FakeLLM()
    streaming.related_questions = lambda *a, **k: []
    streaming.route_message = lambda *a, **k: "search"
    try:
        async def run():
            frames = []
            async for f in streaming.event_stream(
                "q", [], {}, 5, "user-1", "deep", incognito=True
            ):
                frames.append(f)
            return frames

        frames = asyncio.run(run())
        check("T4 incognito deep completes", any('"done"' in f for f in frames))
        check(
            "T4 incognito disables memory learning",
            all(a is False for a in seen_auto) and len(seen_auto) >= 1,
            f"auto_flags={seen_auto}",
        )
        check(
            "T4 incognito skips memory context",
            load_calls == [],
            f"loads={load_calls}",
        )
    finally:
        streaming.load_memory_context = orig_load
        streaming.maybe_learn_memories = orig_learn
        streaming.decompose = orig_decompose
        streaming.collect_round = orig_collect
        streaming.reflect_gaps = orig_reflect
        streaming.synthesize_report = orig_synth
        streaming.get_llm = orig_llm
        streaming.related_questions = orig_related
        streaming.route_message = orig_route


def t5_redaction():
    import inspect

    src = inspect.getsource(deep.verify_report)
    check("T5 verify log redacts",
          '"(redacted)" if redact_query else query[:60]' in src)


if __name__ == "__main__":
    t1_request_flag()
    t2_signatures()
    t3_no_memory_use()
    t4_stream_skips_learning()
    t5_redaction()
    print("FAILURES=%d" % check.failed)
    raise SystemExit(1 if check.failed else 0)
