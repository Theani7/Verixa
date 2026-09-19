"""Tests for mode lock enforcement in active chats (no network, no LLM)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import HTTPException
from backend.main import HistoryTurn, _validate_history_mode


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" " + extra if extra else ""))
    if not cond:
        check.failed += 1
check.failed = 0


def test_empty_history_allows_any_mode():
    try:
        _validate_history_mode([], "search")
        _validate_history_mode([], "deep")
        check("T1 empty history allows any mode", True)
    except Exception as e:
        check("T1 empty history allows any mode", False, str(e))


def test_matching_history_mode_succeeds():
    search_history = [HistoryTurn(query="What is AI?", answer="AI is...", mode="search")]
    deep_history = [HistoryTurn(query="Deep research on AI", answer="Report...", mode="deep")]
    try:
        _validate_history_mode(search_history, "search")
        _validate_history_mode(deep_history, "deep")
        check("T2 matching history mode succeeds", True)
    except Exception as e:
        check("T2 matching history mode succeeds", False, str(e))


def test_switching_search_to_deep_fails():
    search_history = [HistoryTurn(query="What is AI?", answer="AI is...", mode="search")]
    try:
        _validate_history_mode(search_history, "deep")
        check("T3 switching search to deep raises 400", False, "Should have raised HTTPException")
    except HTTPException as e:
        check("T3 switching search to deep raises 400", e.status_code == 400, e.detail)


def test_switching_deep_to_search_fails():
    deep_history = [HistoryTurn(query="Deep research on AI", answer="Report...", mode="deep")]
    try:
        _validate_history_mode(deep_history, "search")
        check("T4 switching deep to search raises 400", False, "Should have raised HTTPException")
    except HTTPException as e:
        check("T4 switching deep to search raises 400", e.status_code == 400, e.detail)


if __name__ == "__main__":
    test_empty_history_allows_any_mode()
    test_matching_history_mode_succeeds()
    test_switching_search_to_deep_fails()
    test_switching_deep_to_search_fails()
    print(f"FAILURES={check.failed}")
    sys.exit(1 if check.failed else 0)
