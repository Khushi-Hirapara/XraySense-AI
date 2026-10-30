"""Google AI Studio Gemini client for the XRaySense Health Assistant.

This module uses the official ``google-genai`` SDK with the Gemini Developer
API. It does not use Vertex AI, and the API key remains on the backend.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from google import genai
from google.genai import errors, types

from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiServiceError(Exception):
    """Base error exposed to the chat orchestration layer."""


class GeminiRateLimitError(GeminiServiceError):
    """The Google AI Studio free-tier request or token limit was reached."""


class GeminiConfigurationError(GeminiServiceError):
    """The API key or configured model is missing or invalid."""


def is_gemini_configured() -> bool:
    return bool((settings.gemini_api_key or "").strip())


@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    """Create one reusable Gemini Developer API client."""
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise GeminiConfigurationError(
            "The Health Assistant is not configured. Set GEMINI_API_KEY."
        )

    # Passing only api_key selects the Gemini Developer API used by AI Studio.
    # No Vertex AI project, location, credentials, or billing configuration is used.
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(api_version="v1beta", timeout=45_000),
    )


def generate_gemini_response(
    *,
    system_instruction: str,
    user_prompt: str,
    temperature: float | None = None,
) -> str:
    """Generate a report-grounded response with the official Google GenAI SDK."""
    model = settings.gemini_model.strip()
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=(
            float(settings.gemini_temperature)
            if temperature is None
            else temperature
        ),
        max_output_tokens=int(settings.gemini_max_output_tokens),
        top_p=0.9,
    )

    try:
        response = get_gemini_client().models.generate_content(
            model=model,
            contents=user_prompt,
            config=config,
        )
    except errors.APIError as exc:
        code = int(exc.code) if exc.code is not None else 0
        message = str(exc.message or "")
        logger.warning(
            "Gemini Developer API error code=%s model=%s message=%s",
            code,
            model,
            message,
        )
        if code == 429 or _is_rate_limit_message(message):
            raise GeminiRateLimitError(
                "The free Gemini service has reached its temporary request "
                "or token limit. Please wait a moment and try again."
            ) from exc
        if code in {400, 401, 403, 404}:
            raise GeminiConfigurationError(
                "Gemini could not use the configured AI Studio key or model. "
                "Check GEMINI_API_KEY and GEMINI_MODEL."
            ) from exc
        raise GeminiServiceError(
            "The Gemini service is temporarily unavailable. Please try again."
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected Gemini SDK failure for model=%s", model)
        raise GeminiServiceError(
            "The Gemini service is temporarily unavailable. Please try again."
        ) from exc

    text = (response.text or "").strip()
    if not text:
        raise GeminiServiceError(
            "Gemini did not return an answer. Please rephrase your question."
        )
    return text


def _is_rate_limit_message(message: str) -> bool:
    normalized = message.lower()
    return any(
        phrase in normalized
        for phrase in (
            "quota",
            "rate limit",
            "resource exhausted",
            "too many requests",
        )
    )
