"""Tests for claim-level deep-research verification (no network, no LLM)."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.verify import (
    Claim,
    VerificationReport,
    check_benchmark_comparability,
    classify_source_quality,
    detect_conflict,
    detect_evidence_type,
    detect_overstatement,
    needs_rewrite,
    rewrite_feedback,
    rule_verify_claim,
    split_claims_fallback,
    verify_claims_batch,
)


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" " + extra if extra else ""))
    if not cond:
        check.failed += 1
check.failed = 0


def t1_supported():
    c = Claim(id="claim_1", text="OpenAI introduced function calling in 2023. [1]",
              citations=[1], claim_type="historical_fact")
    r = rule_verify_claim(
        c, {1: "OpenAI introduced function calling in June 2023 with an API update."},
        {1: {"url": "https://openai.com/blog", "title": "OpenAI blog"}})
    check("T1 supported claim", r.support_status == "supported", r.support_status)


def t2_unsupported():
    c = Claim(id="claim_1", text="The model has 500 billion parameters. [1]",
              citations=[1], claim_type="number_statistic")
    r = rule_verify_claim(
        c, {1: "The release notes describe improved training efficiency."},
        {1: {"url": "https://example.com/news", "title": "News"}})
    check("T2 unsupported claim", r.support_status == "unsupported", r.support_status)


def t3_partial():
    c = Claim(id="claim_1",
              text="The study enrolled 500 patients in Berlin and found a cure. [1]",
              citations=[1], claim_type="technical_claim")
    r = rule_verify_claim(
        c, {1: "The study enrolled 500 patients in Berlin for observation."},
        {1: {"url": "https://example.com/paper", "title": "Paper"}})
    check("T3 partial support", r.support_status == "partially_supported",
          r.support_status)


def t4_conflict():
    c = Claim(id="claim_1", text="The drug is effective. [1] [2]",
              citations=[1, 2], claim_type="technical_claim")
    texts = {1: "The trial shows the drug is effective for patients.",
             2: "However, a review disputes this: no evidence the drug works."}
    check("T4 conflict detected", detect_conflict(c, texts) is True)
    r = rule_verify_claim(c, texts)
    check("T4 contradicted status", r.support_status == "contradicted",
          r.support_status)


def t5_vendor():
    q = classify_source_quality("https://acme.ai/blog/launch", "Acme launch")
    check("T5 vendor is primary-ish", q in ("primary", "secondary"), q)
    e = detect_evidence_type("Our model is great",
                             "We achieve 2.5x throughput. Announcing today.")
    check("T5 vendor_claim typed", e == "vendor_claim", e)


def t6_benchmarks():
    b = check_benchmark_comparability(
        "H100 with 70B is 3x faster than A100 with 7B", "")
    check("T6 low comparability", b == "low", b)
    o = detect_overstatement("This is the best model and solves planning.")
    check("T6 overstatement flagged", len(o) >= 2, str(o))


def t7_tables():
    from backend.chain import SYSTEM_PROMPT
    check("T7 prose-not-tables rule", "ordinary prose into tables" in SYSTEM_PROMPT)



def t8_batch_and_metrics():
    claims = split_claims_fallback(
        "Intro line.\n\nThe trial enrolled 300 patients in 2024. [1]\n\n"
        "Thanks for reading.",
        10)
    check("T8 stylistic skipped", len(claims) == 1, str(len(claims)))
    results = verify_claims_batch(
        claims, {1: "The trial enrolled 300 patients in 2024 at the clinic."},
        {1: {"url": "https://hospital.gov/study", "title": "Study"}}, llm=None)
    check("T8 batch supported", results[0].support_status == "supported",
          results[0].support_status)
    rep = VerificationReport(claims=claims, results=results)
    m = rep.to_metrics()
    check("T8 metrics", m["claims_supported"] == 1 and
          m["claims_extracted"] == 1, str(m))
    fb = rewrite_feedback(results)
    check("T8 no rewrite when clean", fb == "" and
          not needs_rewrite(results[0]))


if __name__ == "__main__":
    t1_supported()
    t2_unsupported()
    t3_partial()
    t4_conflict()
    t5_vendor()
    t6_benchmarks()
    t7_tables()
    t8_batch_and_metrics()
    print("FAILURES=%d" % check.failed)
    raise SystemExit(1 if check.failed else 0)
