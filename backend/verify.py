"""Claim-level evidence verification for deep-research reports."""
from __future__ import annotations
import json as json_lib
import logging
import re
from dataclasses import asdict, dataclass, field
logger = logging.getLogger("verixa.verify")

CLAIM_TYPES = ("historical_fact", "number_statistic", "comparison",
               "technical_claim", "date", "quote", "causal_claim",
               "vendor_claim", "interpretation", "opinion")
SUPPORT_STATES = ("supported", "partially_supported", "unsupported",
                  "contradicted", "unclear")
SOURCE_QUALITY = ("primary", "secondary", "tertiary", "unknown")
EVIDENCE_TYPES = ("documented_fact", "evidence_supported_interpretation",
                  "uncertain_interpretation", "vendor_claim", "missing")
BENCH_COMPARABILITY = ("high", "medium", "low", "not_applicable")


@dataclass
class Claim:
    id: str
    text: str
    citations: list = field(default_factory=list)
    claim_type: str = "technical_claim"


@dataclass
class ClaimVerification:
    claim_id: str
    claim_text: str
    claim_type: str
    citations: list = field(default_factory=list)
    support_status: str = "unclear"
    confidence: str = "low"
    source_quality: str = "unknown"
    evidence_type: str = "missing"
    evidence: str = ""
    reason: str = ""
    overstatement: bool = False
    benchmark_comparability: str = "not_applicable"


@dataclass
class VerificationReport:
    claims: list = field(default_factory=list)
    results: list = field(default_factory=list)
    metrics: dict = field(default_factory=dict)

    def to_metrics(self):
        counts = {"claims_extracted": len(self.claims),
                  "claims_verified": len(self.results),
                  "claims_supported": 0,
                  "claims_partially_supported": 0,
                  "claims_unsupported": 0,
                  "claims_contradicted": 0,
                  "claims_unclear": 0,
                  "claims_rewritten": 0,
                  "verification_failures": 0}
        for r in self.results:
            key = "claims_" + r.support_status
            if key in counts:
                counts[key] += 1
            else:
                counts["claims_unclear"] += 1
        for k, v in self.metrics.items():
            counts[k] = v
        return counts


OVERSTATEMENT_WORDS = ("best", "dominant", "solved", "solves", "eliminated",
                       "revolutionary", "always", "never", "proves",
                       "prove", "guarantees", "guarantee",
                       "most popular", "industry standard")
_OVERSTATEMENT_RES = [re.compile(r"\b" + re.escape(w) + r"\b", re.IGNORECASE)
                      for w in OVERSTATEMENT_WORDS]
_NX_RES = [re.compile(r"\b\d+\s?x\s?(faster|cheaper|better|more)\b",
                      re.IGNORECASE)]


def detect_overstatement(text):
    found = [rx.pattern for rx in _OVERSTATEMENT_RES if rx.search(text or "")]
    found += [rx.pattern for rx in _NX_RES if rx.search(text or "")]
    return found


_PRIMARY_HINTS = ("docs.", "documentation", "arxiv.org", ".gov", ".edu",
                  "github.com", "huggingface.co", "paperswithcode.com")
_TERTIARY_HINTS = ("reddit.com", "quora.com", "medium.com", "blogspot.",
                    "wordpress.com", "forum", "stackexchange",
                    "stackoverflow.com", "aggregator")
_VENDOR_HINTS = ("we achieve", "our model", "our system", "our platform",
                 "announces", "introducing", "press release", "vendor")
_CITE_RE = re.compile(r"\[(\d+)\]")


def classify_source_quality(url, title=""):
    blob = ((url or "") + " " + (title or "")).lower()
    for h in _TERTIARY_HINTS:
        if h in blob:
            return "tertiary"
    for h in _PRIMARY_HINTS:
        if h in blob:
            return "primary"
    if re.search(r"\.(com|org|net|io|ai|dev|co)\b", blob):
        return "secondary"
    return "unknown"


def detect_evidence_type(claim_text, evidence):
    blob = ((claim_text or "") + " " + (evidence or "")).lower()
    for h in _VENDOR_HINTS:
        if h in blob:
            return "vendor_claim"
    return "documented_fact"


def check_benchmark_comparability(text, evidence):
    blob = (text or "") + " " + (evidence or "")
    models = set(re.findall(r"[A-Za-z]{1,4}[- ]?\d{1,3}B?", blob))
    hw = set(m.lower() for m in
             re.findall(r"A100|H100|H200|V100|MI\d{3}|TPU|RTX|T4|L4|A10",
                        blob, re.IGNORECASE))
    comp = bool(re.search(r"vs\.?|versus|compared|faster|slower|cheaper",
                          blob, re.IGNORECASE))
    if comp and (len(models) >= 2 or len(hw) >= 2):
        return "low"

_CONTRAST_RES = [re.compile(r"\b" + re.escape(w) + r"\b", re.IGNORECASE)
                 for w in ("however", "contrary", "contradicts", "disputes",
                           "no evidence", "false", "incorrect", "refutes",
                           "disagrees", "instead")]


def detect_conflict(claim, source_texts):
    if len(claim.citations) < 2:
        return False
    words = [w.lower() for w in
             re.findall(r"[A-Za-z][A-Za-z0-9\-]{3,}", claim.text)
             if w.lower() not in _STOPWORDS][:12]
    if not words:
        return False
    supported = 0
    contrasted = 0
    for cid in claim.citations:
        blob = (source_texts.get(cid, "") or "").lower()
        if not blob.strip():
            continue
        ratio = sum(1 for w in words if w in blob) / len(words)
        has_contrast = any(rx.search(blob) for rx in _CONTRAST_RES)
        if ratio >= 0.5:
            supported += 1
        if has_contrast:
            contrasted += 1
    return supported >= 1 and contrasted >= 1


def guess_claim_type(text):
    low = (text or "").lower()
    if low.count('"') >= 2 or " said " in (" " + low + " "):
        return "quote"
    if re.search(r"\d+(\.\d+)?\s?(%|percent|billion|million|ms)\b", low):
        return "number_statistic"
    if re.search(r"vs\.?|versus|compared|than|faster|slower|better|best",
                 low):
        return "comparison"
    if re.search(r"because|causes?|leads? to|results? in|due to", low):
        return "causal_claim"
    if re.search(r"\b\d{4}\b", text or ""):
        return "date"
    if re.search(r"in my view|i think|arguably|seems|appears", low):
        return "opinion"
    if re.search(r"may|might|suggests?|indicates?|likely|interpret", low):
        return "interpretation"
    for h in _VENDOR_HINTS:
        if h in low:
            return "vendor_claim"
    if re.search(r"first|introduced|founded|launched|released", low):
        return "historical_fact"
    return "technical_claim"


_STOPWORDS = {"with", "from", "that", "this", "have", "has", "were",
              "been", "their", "they", "which", "when", "than", "then",
              "about", "into", "over", "under", "between"}


def split_claims_fallback(draft, max_claims=24):
    claims = []
    idx = 0
    text = re.sub(r"```.*?```", "", draft or "", flags=re.DOTALL)
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("```"):
            continue
        cleaned = re.sub(r"^[\s>*\-|]+", "", stripped).strip()
        trailing_cites = [int(n) for n in _CITE_RE.findall(cleaned)]
        for sent in re.split(r"(?<=[.!?])\s+", cleaned):
            sent = sent.strip().strip("|").strip()
            if sent and not _CITE_RE.search(sent) and trailing_cites:
                sent = sent + " [%d]" % trailing_cites[0]
            if len(sent) < 25:
                continue
            cites = [int(n) for n in _CITE_RE.findall(sent)]
            factual = bool(
                cites or re.search(
                    r"\d|percent|%|study|research|benchmark|report|"
                    r"according|found|shows?|increased?|decreased?|"
                    r"launched?|released?|announced?|faster|slower|"
                    r"better|versus", sent, re.IGNORECASE))
            if not factual:
                continue
            idx += 1
            claims.append(Claim(id="claim_%d" % idx, text=sent[:400],
                                citations=cites,
                                claim_type=guess_claim_type(sent)))
            if len(claims) >= max_claims:
                return claims
    return claims


def rule_verify_claim(claim, source_texts, source_meta=None):
    meta = source_meta or {}
    words = [w.lower() for w in
             re.findall(r"[A-Za-z][A-Za-z0-9\-]{3,}", claim.text)
             if w.lower() not in _STOPWORDS]
    key = words[:12]
    qualities = []
    for cid in claim.citations:
        m = meta.get(cid, {}) or {}
        q = m.get("quality") or classify_source_quality(
            m.get("url", ""), m.get("title", ""))
        qualities.append(q)
    if not claim.citations:
        return ClaimVerification(
            claim_id=claim.id, claim_text=claim.text,
            claim_type=claim.claim_type, citations=[],
            support_status="unsupported", confidence="high",
            source_quality="unknown", evidence_type="missing",
            evidence="",
            reason="No citation: no retrieved source backs this claim.",
            overstatement=bool(detect_overstatement(claim.text)),
            benchmark_comparability=check_benchmark_comparability(
                claim.text, ""))
    evidences = [(source_texts.get(cid, "") or "")
                 for cid in claim.citations]
    blob = "\n".join(evidences).lower()
    if not blob.strip():
        return ClaimVerification(
            claim_id=claim.id, claim_text=claim.text,
            claim_type=claim.claim_type,
            citations=list(claim.citations),
            support_status="unsupported", confidence="medium",
            source_quality=qualities[0] if qualities else "unknown",
            evidence_type="missing", evidence="",
            reason="Cited source text is empty or was not retrieved.",
            overstatement=bool(detect_overstatement(claim.text)),
            benchmark_comparability=check_benchmark_comparability(
                claim.text, ""))
    hits = sum(1 for w in key if w in blob) if key else 0
    ratio = (hits / len(key)) if key else 0.0
    if ratio >= 0.7:
        status, conf = "supported", "high"
    elif ratio >= 0.4:
        status, conf = "partially_supported", "medium"
    else:
        status, conf = "unsupported", "medium"
    evidence = (evidences[0] or "")[:600]
    if detect_conflict(claim, source_texts):
        return ClaimVerification(
            claim_id=claim.id, claim_text=claim.text,
            claim_type=claim.claim_type,
            citations=list(claim.citations),
            support_status="contradicted", confidence="medium",
            source_quality=qualities[0] if qualities else "unknown",
            evidence_type="uncertain_interpretation",
            evidence=evidence[:600],
            reason=("Cited sources disagree; present both viewpoints."),
            overstatement=bool(detect_overstatement(claim.text)),
            benchmark_comparability=check_benchmark_comparability(
                claim.text, blob))
    quality = qualities[0] if qualities else "unknown"
    etype = detect_evidence_type(claim.text, evidence)
    if status != "supported":
        etype = "missing"
    summary = "Keyword overlap %d/%d between claim and cited source." % (
        hits, len(key))
    return ClaimVerification(
        claim_id=claim.id, claim_text=claim.text,
        claim_type=claim.claim_type, citations=list(claim.citations),
        support_status=status, confidence=conf, source_quality=quality,
        evidence_type=etype, evidence=evidence, reason=summary,
        overstatement=bool(detect_overstatement(claim.text)),
        benchmark_comparability=check_benchmark_comparability(
            claim.text, blob))

    if re.search(r"benchmark|throughput|latency|tokens/s", blob,
                 re.IGNORECASE):
        return "medium" if comp else "not_applicable"
    return "not_applicable"


EXTRACT_SYSTEM_PROMPT = (
    "You are a claim-extraction assistant. From a research draft, extract "
    "factual claims needing verification. Skip stylistic sentences. "
    "Return ONLY a JSON array with keys id, text, citations, claim_type."
)

BATCH_VERIFY_SYSTEM_PROMPT = (
    "You are a strict evidence-checking editor. For EACH claim check it "
    "against ONLY the cited source texts. A citation does NOT imply "
    "support. Return ONLY a JSON array with keys claim_id, "
    "support_status, confidence, source_quality, evidence_type, "
    "evidence, reason, overstatement, benchmark_comparability."
)


def _parse_json_array(text):
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[1]
    try:
        parsed = json_lib.loads(cleaned)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        pass
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if not match:
        return []
    try:
        parsed = json_lib.loads(match.group(0))
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []

def extract_claims(draft, llm, max_claims=24):
    try:
        from langchain_core.prompts import ChatPromptTemplate
        prompt = ChatPromptTemplate.from_messages(
            [("system", EXTRACT_SYSTEM_PROMPT),
             ("human", "Draft:\n{draft}")])
        response = (prompt | llm).invoke({"draft": (draft or "")[:8000]})
        content = (response.content
                   if isinstance(response.content, str) else "")
        items = _parse_json_array(content)
        claims = []
        for i, item in enumerate(items[:max_claims]):
            if not isinstance(item, dict):
                continue
            if not str(item.get("text", "")).strip():
                continue
            ctype = str(item.get("claim_type", "technical_claim"))
            if ctype not in CLAIM_TYPES:
                ctype = "technical_claim"
            cites = []
            for c in (item.get("citations") or []):
                if isinstance(c, int):
                    cites.append(c)
                elif isinstance(c, str) and c.isdigit():
                    cites.append(int(c))
            cid = str(item.get("id") or ("claim_%d" % (i + 1)))
            claims.append(Claim(id=cid, text=str(item.get("text"))[:400],
                                citations=cites, claim_type=ctype))
        if claims:
            return claims
    except Exception as exc:
        logger.warning("extract_claims LLM failed, fallback: %s", exc)
    return split_claims_fallback(draft, max_claims)

def verify_claims_batch(claims, source_texts, source_meta=None, llm=None):
    meta = source_meta or {}
    if llm is not None and claims:
        try:
            from langchain_core.prompts import ChatPromptTemplate
            payload = []
            for c in claims:
                cited = {}
                for cid in c.citations:
                    cited[str(cid)] = (source_texts.get(cid, "") or "")[:1500]
                payload.append({"claim_id": c.id, "claim_text": c.text,
                                "claim_type": c.claim_type,
                                "citations": c.citations,
                                "cited_texts": cited})
            prompt = ChatPromptTemplate.from_messages(
                [("system", BATCH_VERIFY_SYSTEM_PROMPT),
                 ("human", "Verify these claims:\n{claims_json}")])
            response = (prompt | llm).invoke(
                {"claims_json": json_lib.dumps(payload)[:14000]})
            content = (response.content
                       if isinstance(response.content, str) else "")
            items = _parse_json_array(content)
            by_id = {c.id: c for c in claims}
            out = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                cid = str(item.get("claim_id", ""))
                claim = by_id.get(cid)
                if claim is None:
                    continue
                status = str(item.get("support_status", "unclear"))
                if status not in SUPPORT_STATES:
                    status = "unclear"
                quality = str(item.get("source_quality", "unknown"))
                if quality not in SOURCE_QUALITY:
                    quality = "unknown"
                etype = str(item.get("evidence_type", "missing"))
                if etype not in EVIDENCE_TYPES:
                    etype = "missing"
                bench = str(item.get("benchmark_comparability",
                                     "not_applicable"))
                if bench not in BENCH_COMPARABILITY:
                    bench = "not_applicable"
                out.append(ClaimVerification(
                    claim_id=cid, claim_text=claim.text,
                    claim_type=claim.claim_type,
                    citations=list(claim.citations),
                    support_status=status,
                    confidence=str(item.get("confidence", "low")),
                    source_quality=quality, evidence_type=etype,
                    evidence=str(item.get("evidence", ""))[:600],
                    reason=str(item.get("reason", ""))[:600],
                    overstatement=bool(item.get("overstatement", False)),
                    benchmark_comparability=bench))
            if out:
                seen = {r.claim_id for r in out}
                for c in claims:
                    if c.id not in seen:
                        out.append(rule_verify_claim(c, source_texts, meta))
                return sorted(out, key=lambda r: r.claim_id)
        except Exception as exc:
            logger.warning("verify_claims_batch LLM failed: %s", exc)
    return [rule_verify_claim(c, source_texts, meta) for c in claims]


def needs_rewrite(result):
    if result.support_status in ("unsupported", "contradicted"):
        return True
    if result.support_status == "partially_supported":
        return True
    if result.overstatement and result.support_status != "supported":
        return True
    if (result.benchmark_comparability == "low" and result.claim_type
            in ("comparison", "number_statistic")):
        return True
    return False


def rewrite_feedback(results):
    lines = []
    for r in results:
        if not needs_rewrite(r):
            continue
        note = ("- Claim '%s' (cited %s): " % (r.claim_text[:160],
                                               r.citations))
        if r.support_status in ("unsupported", "contradicted"):
            note += ("status is %s. %s Soften to what sources establish, "
                     "or write 'The available sources do not establish "
                     "this.' Never invent a citation. "
                     % (r.support_status, (r.reason or "")[:200]))
        elif r.support_status == "partially_supported":
            note += ("only partially supported. %s Keep the supported "
                     "part; hedge or drop the rest. "
                     % ((r.reason or "")[:200]))
        if r.overstatement:
            note += ("Wording overstates the evidence; use measured "
                     "source wording. ")
        if r.benchmark_comparability == "low":
            note += ("Numbers come from different setups: add an explicit "
                     "non-comparability note. ")
        if r.evidence_type == "vendor_claim":
            note += ("Attribute as vendor claim, not independent fact. ")
        lines.append(note)
    return "\n".join(lines)


def report_to_dict(report):
    return {"claims": [asdict(c) for c in report.claims],
            "results": [asdict(r) for r in report.results],
            "metrics": report.to_metrics()}


