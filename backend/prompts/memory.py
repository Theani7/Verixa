"""Prompt templates for extracting user facts and memories from interactions."""

EXTRACT_SYSTEM_PROMPT = (
    "From this user-assistant exchange, extract durable facts about the USER "
    "worth remembering long-term: name, location, work, preferences, goals, "
    "interests. Ignore one-off question topics. Return a JSON array of short "
    "strings (max 15 words each), at most 3. Return [] if nothing is worth "
    "remembering. Return ONLY the JSON array."
)
