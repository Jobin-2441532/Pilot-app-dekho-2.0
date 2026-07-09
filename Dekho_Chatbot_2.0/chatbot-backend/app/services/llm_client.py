"""
LLM Client — multi-provider wrapper with a 3-tier waterfall.

Provider waterfall (configurable via settings):
    1. Groq        — primary, fast inference (llama-3.3-70b-versatile)
    2. Gemini      — secondary, Google Gemini 2.0 Flash (free, high quality)
    3. OpenRouter  — last-resort, community free models
    4. Static text — caller is responsible for static fallback if all fail

Groq and OpenRouter use the OpenAI-compatible SDK.
Gemini uses the google-generativeai SDK with its own async interface.

Supports:
    - Non-streaming  generate()
    - Streaming      stream()  → AsyncGenerator[str, None]
    - Per-provider retry (up to 2 retries) before escalating to next provider
    - Structured logging: provider used, model, latency, fallback events
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncGenerator

from openai import AsyncOpenAI, APIStatusError, APIConnectionError, APITimeoutError

from app.config import settings

logger = logging.getLogger("dekho.llm")


# ── OpenAI-compatible provider helpers ───────────────────────────────────────

def _openrouter_client() -> AsyncOpenAI:
    """Build an AsyncOpenAI client pointed at OpenRouter."""
    return AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        timeout=settings.llm_timeout_seconds,
        default_headers={
            "HTTP-Referer": "https://askdekho.app",
            "X-Title": "Dekho",
        },
    )


def _groq_client() -> AsyncOpenAI:
    """Build an AsyncOpenAI client pointed at Groq."""
    return AsyncOpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_base_url,
        timeout=settings.llm_timeout_seconds,
    )


def _compat_provider_config(provider: str) -> tuple[AsyncOpenAI, str]:
    """Return (client, model) for OpenAI-compatible providers."""
    if provider == "openrouter":
        return _openrouter_client(), settings.openrouter_model
    elif provider == "groq":
        return _groq_client(), settings.groq_model
    else:
        raise ValueError(f"Not an OpenAI-compat provider: {provider!r}")


def _build_messages(
    system_prompt: str,
    user_message: str,
    history: list[dict] | None,
) -> list[dict]:
    """Assemble OpenAI-style messages list."""
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history:
            role = msg.get("role", "user")
            if role == "model":
                role = "assistant"
            messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})
    return messages


# ── Gemini-specific helpers ───────────────────────────────────────────────────

def _gemini_available() -> bool:
    """True if a Gemini API key is configured."""
    return bool(settings.gemini_api_key)


def _build_gemini_prompt(
    system_prompt: str,
    user_message: str,
    history: list[dict] | None,
) -> tuple[str, list[dict]]:
    """
    Build (combined_system_user_message, gemini_history) for the Gemini SDK.
    Gemini 2.0 Flash supports system instructions natively.
    """
    gemini_history = []
    if history:
        for msg in history:
            role = msg.get("role", "user")
            # Gemini uses "user" / "model" roles
            gemini_role = "model" if role == "assistant" else "user"
            gemini_history.append({
                "role": gemini_role,
                "parts": [msg.get("content", "")],
            })
    return system_prompt, gemini_history


async def _gemini_generate(
    system_prompt: str,
    user_message: str,
    history: list[dict] | None,
    max_tokens: int,
    temperature: float,
) -> str | None:
    """
    Non-streaming generation via Gemini 2.0 Flash.
    Returns text on success, None on failure.
    """
    if not _gemini_available():
        logger.debug("Gemini skipped — no API key configured")
        return None

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)

        sys_instruction, gemini_history = _build_gemini_prompt(system_prompt, user_message, history)

        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=sys_instruction,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )

        t0 = time.perf_counter()
        chat = model.start_chat(history=gemini_history)
        response = await asyncio.wait_for(
            chat.send_message_async(user_message),
            timeout=settings.llm_timeout_seconds,
        )
        elapsed = time.perf_counter() - t0
        text = response.text or ""
        logger.info(
            "LLM response | provider=gemini model=%s latency=%.2fs chars=%d",
            settings.gemini_model, elapsed, len(text),
        )
        return text

    except asyncio.TimeoutError:
        logger.warning("Gemini timeout after %ds", settings.llm_timeout_seconds)
        return None
    except Exception as e:
        err = str(e)
        if "429" in err or "quota" in err.lower() or "RESOURCE_EXHAUSTED" in err:
            logger.warning("Gemini rate-limited: %s", err[:120])
        else:
            logger.error("Gemini error: %s", err[:200])
        return None


async def _gemini_stream(
    system_prompt: str,
    user_message: str,
    history: list[dict] | None,
    max_tokens: int,
    temperature: float,
) -> AsyncGenerator[str | None, None]:
    """
    Streaming generation via Gemini 2.0 Flash.
    Yields text chunks on success; yields a single None sentinel on failure.
    """
    if not _gemini_available():
        logger.debug("Gemini skipped — no API key configured")
        yield None
        return

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)

        sys_instruction, gemini_history = _build_gemini_prompt(system_prompt, user_message, history)

        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=sys_instruction,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )

        t0 = time.perf_counter()
        chat = model.start_chat(history=gemini_history)

        # Gemini supports native async streaming
        response = await asyncio.wait_for(
            chat.send_message_async(user_message, stream=True),
            timeout=settings.llm_timeout_seconds
        )

        token_count = 0
        async for chunk in response:
            text = chunk.text if hasattr(chunk, "text") else ""
            if text:
                token_count += 1
                yield text

        elapsed = time.perf_counter() - t0
        logger.info(
            "LLM stream complete | provider=gemini model=%s latency=%.2fs chunks=%d",
            settings.gemini_model, elapsed, token_count,
        )

    except asyncio.TimeoutError:
        logger.warning("Gemini stream timeout")
        yield None
    except Exception as e:
        err = str(e)
        if "429" in err or "quota" in err.lower() or "RESOURCE_EXHAUSTED" in err:
            logger.warning("Gemini stream rate-limited: %s", err[:120])
        else:
            logger.error("Gemini stream error: %s", err[:200])
        yield None


# ── Core LLM Client ───────────────────────────────────────────────────────────

class LLMClient:
    """
    Unified LLM client with a 3-tier provider waterfall:
        Groq → Gemini 2.0 Flash → OpenRouter

    Usage:
        client = LLMClient()
        text = await client.generate(system_prompt, user_message, history)

        async for token in client.stream(system_prompt, user_message, history):
            print(token, end="", flush=True)
    """

    MAX_RETRIES = 2  # retries per OpenAI-compat provider before escalating

    def __init__(self) -> None:
        self.primary   = settings.llm_provider_primary    # default: "groq"
        self.secondary = settings.llm_provider_secondary   # default: "gemini"
        self.tertiary  = settings.llm_provider_tertiary    # default: "openrouter"

    # ── Non-streaming ─────────────────────────────────────────────────────────

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        """
        Generate a complete (non-streaming) response.
        Tries primary → secondary (Gemini) → tertiary before raising.
        """
        messages = _build_messages(system_prompt, user_message, conversation_history)

        for provider in (self.primary, self.secondary, self.tertiary):
            if provider == "gemini":
                result = await _gemini_generate(
                    system_prompt, user_message, conversation_history,
                    max_tokens, temperature,
                )
            else:
                result = await self._try_generate(provider, messages, max_tokens, temperature)

            if result is not None:
                return result

        raise RuntimeError(
            "All LLM providers failed — caller should use static fallback."
        )

    async def _try_generate(
        self,
        provider: str,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str | None:
        """
        Attempt non-streaming generation with an OpenAI-compatible provider.
        Returns text on success, None on failure (after retries).
        """
        try:
            client, model = _compat_provider_config(provider)
        except ValueError:
            logger.warning("Skipping unknown provider: %s", provider)
            return None

        for attempt in range(self.MAX_RETRIES + 1):
            t0 = time.perf_counter()
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                text = response.choices[0].message.content or ""
                elapsed = time.perf_counter() - t0
                logger.info(
                    "LLM response | provider=%s model=%s latency=%.2fs tokens=%d",
                    provider, model, elapsed,
                    response.usage.completion_tokens if response.usage else -1,
                )
                return text

            except APITimeoutError:
                logger.warning(
                    "LLM timeout | provider=%s attempt=%d/%d",
                    provider, attempt + 1, self.MAX_RETRIES + 1,
                )
            except APIStatusError as e:
                if e.status_code == 429:
                    logger.warning(
                        "LLM rate-limited | provider=%s attempt=%d status=429",
                        provider, attempt + 1,
                    )
                else:
                    logger.error(
                        "LLM API error | provider=%s attempt=%d status=%d body=%s",
                        provider, attempt + 1, e.status_code, str(e)[:120],
                    )
            except APIConnectionError:
                logger.error(
                    "LLM connection error | provider=%s attempt=%d/%d",
                    provider, attempt + 1, self.MAX_RETRIES + 1,
                )
            except Exception as e:
                logger.error(
                    "LLM unexpected error | provider=%s attempt=%d: %s",
                    provider, attempt + 1, str(e)[:200],
                )

            if attempt < self.MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)

        logger.warning("LLM fallback triggered | provider=%s exhausted → trying next", provider)
        return None

    # ── Streaming ─────────────────────────────────────────────────────────────

    async def stream(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Stream response tokens one by one.
        Tries primary → secondary (Gemini) → tertiary before raising.
        """
        messages = _build_messages(system_prompt, user_message, conversation_history)

        for provider in (self.primary, self.secondary, self.tertiary):
            success = False

            if provider == "gemini":
                async for token in _gemini_stream(
                    system_prompt, user_message, conversation_history,
                    max_tokens, temperature,
                ):
                    if token is None:
                        break   # sentinel — try next provider
                    success = True
                    yield token
            else:
                async for token in self._try_stream(provider, messages, max_tokens, temperature):
                    if token is None:
                        break   # sentinel — try next provider
                    success = True
                    yield token

            if success:
                return  # streaming completed successfully

        raise RuntimeError(
            "All LLM providers failed during streaming — caller should use static fallback."
        )

    async def _try_stream(
        self,
        provider: str,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> AsyncGenerator[str | None, None]:
        """
        Attempt streaming with an OpenAI-compatible provider.
        Yields string tokens on success.
        Yields a single None sentinel on failure (signals caller to try next provider).
        """
        try:
            client, model = _compat_provider_config(provider)
        except ValueError:
            logger.warning("Skipping unknown provider: %s", provider)
            yield None
            return

        for attempt in range(self.MAX_RETRIES + 1):
            t0 = time.perf_counter()
            try:
                stream = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )

                token_count = 0
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        token_count += 1
                        yield delta

                elapsed = time.perf_counter() - t0
                logger.info(
                    "LLM stream complete | provider=%s model=%s latency=%.2fs tokens=%d",
                    provider, model, elapsed, token_count,
                )
                return  # success

            except APITimeoutError:
                logger.warning(
                    "LLM stream timeout | provider=%s attempt=%d/%d",
                    provider, attempt + 1, self.MAX_RETRIES + 1,
                )
            except APIStatusError as e:
                if e.status_code == 429:
                    logger.warning(
                        "LLM stream rate-limited | provider=%s attempt=%d status=429",
                        provider, attempt + 1,
                    )
                else:
                    logger.error(
                        "LLM stream API error | provider=%s attempt=%d status=%d body=%s",
                        provider, attempt + 1, e.status_code, str(e)[:120],
                    )
            except APIConnectionError:
                logger.error(
                    "LLM stream connection error | provider=%s attempt=%d/%d",
                    provider, attempt + 1, self.MAX_RETRIES + 1,
                )
            except Exception as e:
                logger.error(
                    "LLM stream unexpected error | provider=%s attempt=%d: %s",
                    provider, attempt + 1, str(e)[:200],
                )

            if attempt < self.MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)

        logger.warning("LLM stream fallback triggered | provider=%s exhausted → trying next", provider)
        yield None  # sentinel
