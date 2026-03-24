"""Output formatter — JSONL matching the benchmark spec."""

from __future__ import annotations


def format_output_line(task_id: int, prompt: str, article: str) -> dict:
    """Format a single output entry matching the benchmark's expected schema."""
    return {
        "id": task_id,
        "prompt": prompt,
        "article": article,
    }
