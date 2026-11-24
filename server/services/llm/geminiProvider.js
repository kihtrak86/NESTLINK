const logger = require("../../utils/logger");

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_LLM_TIMEOUT_MS = 20000;

class LlmProviderError extends Error {
  constructor(message, { code = "LLM_ERROR", statusCode = 503, publicMessage } = {}) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = publicMessage || "AI analysis service is temporarily unavailable.";
  }
}

class GeminiProvider {
  constructor({
    apiKey = (process.env.GEMINI_API_KEY || "").trim(),
    model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim(),
    baseUrl = (process.env.GEMINI_API_BASE_URL || DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, ""),
    timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || String(DEFAULT_LLM_TIMEOUT_MS), 10) ||
      DEFAULT_LLM_TIMEOUT_MS,
    fetchImpl = global.fetch,
  } = {}) {
    this.name = "gemini";
    this.apiKey = apiKey;
    this.model = model || DEFAULT_GEMINI_MODEL;
    this.baseUrl = baseUrl;
    this.timeoutMs = Math.max(2000, timeoutMs);
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async generate({
    systemInstruction,
    userPrompt,
    responseMimeType = "text/plain",
    temperature = 0.2,
    maxOutputTokens = 512,
  }) {
    if (!this.isConfigured()) {
      throw new LlmProviderError("GEMINI_API_KEY is not configured.", {
        code: "LLM_NOT_CONFIGURED",
        statusCode: 503,
        publicMessage: "AI analysis is not configured on the server yet.",
      });
    }

    if (typeof this.fetchImpl !== "function") {
      throw new LlmProviderError("Global fetch is not available.", {
        code: "RUNTIME_ERROR",
        statusCode: 500,
      });
    }

    const endpoint = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const payload = {
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType,
      },
    };

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const providerMsg = data?.error?.message || `HTTP ${response.status}`;
        logger.warn("llm.gemini.http_error", { status: response.status, providerMsg });
        const statusCode = response.status === 429 ? 429 : 503;
        const publicMessage =
          response.status === 429
            ? "AI service rate limit reached. Please try again shortly."
            : "AI analysis service is temporarily unavailable.";
        throw new LlmProviderError(`Gemini API error (${response.status}): ${providerMsg}`, {
          code: response.status === 429 ? "LLM_RATE_LIMITED" : "LLM_UPSTREAM_ERROR",
          statusCode,
          publicMessage,
        });
      }

      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts;
      const text = Array.isArray(parts)
        ? parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
        : "";

      if (!text) {
        throw new LlmProviderError("Gemini returned an empty response.", {
          code: "LLM_EMPTY_RESPONSE",
          statusCode: 502,
          publicMessage: "AI analysis returned an empty response. Please try again.",
        });
      }

      return {
        text,
        provider: this.name,
        model: this.model,
      };
    } catch (err) {
      if (err instanceof LlmProviderError) {
        throw err;
      }
      if (err?.name === "AbortError") {
        throw new LlmProviderError(`Gemini request timed out after ${this.timeoutMs}ms.`, {
          code: "LLM_TIMEOUT",
          statusCode: 504,
          publicMessage: "AI analysis timed out. Please try again.",
        });
      }
      throw new LlmProviderError(`Gemini request failed: ${err?.message || "unknown error"}`, {
        code: "LLM_NETWORK_ERROR",
        statusCode: 503,
        publicMessage: "AI analysis service is temporarily unavailable.",
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  GeminiProvider,
  LlmProviderError,
  DEFAULT_GEMINI_MODEL,
};
