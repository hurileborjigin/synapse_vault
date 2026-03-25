"""Configuration for Synapse Agent."""

from __future__ import annotations

import os
from enum import Enum
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

# Load .env before anything reads os.getenv
_env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_env_path, override=False)


class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    AZURE_OPENAI = "azure_openai"
    COMPATIBLE = "compatible"  # Any OpenAI-compatible endpoint


class Settings(BaseSettings):
    model_config = {"env_prefix": "SYNAPSE_", "env_file": ".env", "extra": "ignore"}

    # LLM
    llm_provider: LLMProvider = LLMProvider.ANTHROPIC
    llm_model: str = "claude-sonnet-4-20250514"
    llm_temperature: float = 0.3

    # Per-node model overrides (fall back to llm_model)
    analyzer_model: str | None = None
    searcher_model: str | None = None
    synthesizer_model: str | None = None
    quality_model: str | None = None

    # Provider keys
    anthropic_api_key: str = Field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    openai_api_key: str = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    azure_openai_api_key: str = Field(default_factory=lambda: os.getenv("AZURE_OPENAI_API_KEY", ""))
    azure_openai_endpoint: str = Field(default_factory=lambda: os.getenv("AZURE_OPENAI_ENDPOINT", ""))
    azure_openai_api_version: str = "2024-06-01"
    compatible_api_key: str = Field(default_factory=lambda: os.getenv("COMPATIBLE_API_KEY", ""))
    compatible_base_url: str = Field(default_factory=lambda: os.getenv("COMPATIBLE_BASE_URL", ""))

    # Search API keys
    jina_api_key: str = Field(default_factory=lambda: os.getenv("JINA_API_KEY", ""))
    brave_api_key: str = Field(default_factory=lambda: os.getenv("BRAVE_API_KEY", ""))
    tavily_api_key: str = Field(default_factory=lambda: os.getenv("TAVILY_API_KEY", ""))

    # Workflow
    max_search_iterations: int = 1
    max_revisions: int = 2
    search_results_per_query: int = 10
    relevance_threshold: float = 6.0
    min_citations: int = 10
    quality_threshold: float = 7.0

    # Concurrency
    max_concurrent_searches: int = 5

    def get_model(self, node: str) -> str:
        override = getattr(self, f"{node}_model", None)
        return override or self.llm_model

    def get_llm(self, node: str = "default"):
        model = self.get_model(node)
        if self.llm_provider == LLMProvider.ANTHROPIC:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=model,
                api_key=self.anthropic_api_key,
                temperature=self.llm_temperature,
                max_tokens=8192,
            )
        elif self.llm_provider == LLMProvider.OPENAI:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                api_key=self.openai_api_key,
                temperature=self.llm_temperature,
            )
        elif self.llm_provider == LLMProvider.AZURE_OPENAI:
            from langchain_openai import AzureChatOpenAI
            return AzureChatOpenAI(
                azure_deployment=model,
                api_key=self.azure_openai_api_key,
                azure_endpoint=self.azure_openai_endpoint,
                api_version=self.azure_openai_api_version,
                temperature=self.llm_temperature,
            )
        else:  # COMPATIBLE
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                api_key=self.compatible_api_key,
                base_url=self.compatible_base_url,
                temperature=self.llm_temperature,
            )


settings = Settings()
