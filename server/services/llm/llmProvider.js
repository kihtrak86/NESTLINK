const { GeminiProvider, LlmProviderError } = require("./geminiProvider");

const customProviders = new Map();

/**
 * Registers a custom LLM provider implementation so future providers
 * (e.g., OpenAI, Anthropic, local Ollama) can be plugged in without refactoring callers.
 */
function registerLlmProvider(name, factory) {
  if (!name || typeof factory !== "function") {
    throw new Error("Provider name and factory function are required.");
  }
  customProviders.set(String(name).toLowerCase(), factory);
}

/**
 * Returns an active LLM provider instance based on LLM_PROVIDER env var (defaults to "gemini").
 */
function getLlmProvider(options = {}) {
  const providerName = (options.provider || process.env.LLM_PROVIDER || "gemini")
    .trim()
    .toLowerCase();

  if (customProviders.has(providerName)) {
    return customProviders.get(providerName)(options);
  }

  switch (providerName) {
    case "gemini":
      return new GeminiProvider(options);
    default:
      throw new LlmProviderError(`Unsupported LLM provider: ${providerName}`, {
        code: "UNSUPPORTED_LLM_PROVIDER",
        statusCode: 500,
        publicMessage: "AI provider configuration is invalid.",
      });
  }
}

module.exports = {
  getLlmProvider,
  registerLlmProvider,
  LlmProviderError,
};
