import unittest
from backend import answer_cache


class TestAnswerCache(unittest.TestCase):
    def setUp(self):
        answer_cache.clear()

    def test_cache_put_get(self):
        key = answer_cache.make_key(
            query="What is quantum computing?",
            mode="search",
            profile={},
            num_results=5,
            history=[],
        )
        self.assertIsNotNone(key)
        data = {"answer": "Quantum computing uses qubits.", "mode": "search"}
        answer_cache.put(key, data)

        cached = answer_cache.get(key)
        self.assertEqual(cached, data)

    def test_cache_bypasses_history(self):
        key = answer_cache.make_key(
            query="Tell me more",
            mode="search",
            profile={},
            num_results=5,
            history=[{"query": "Hello", "answer": "Hi"}],
        )
        self.assertIsNone(key)
        self.assertIsNone(answer_cache.get(key))

    def test_cache_normalizes_whitespace_and_case(self):
        key1 = answer_cache.make_key("  what is AI? ", "search", {}, 5, [])
        key2 = answer_cache.make_key("WHAT IS AI?", "search", {}, 5, [])
        self.assertEqual(key1, key2)


if __name__ == "__main__":
    unittest.main()
