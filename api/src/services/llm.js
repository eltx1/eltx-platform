const { openaiClient } = require('../config/openai');

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function getLlmProviderSettings() {
  const useOllama = parseBoolean(process.env.USE_OLLAMA, true);
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3.5:2b';
  return {
    useOllama,
    provider: useOllama ? 'ollama' : 'openai',
    ollamaBaseUrl,
    ollamaModel,
    openaiConfigured: !!openaiClient,
  };
}

function normalizeMessages({ messages, systemPrompt, userPrompt }) {
  const normalized = [];
  if (Array.isArray(messages) && messages.length > 0) {
    for (const msg of messages) {
      if (!msg || typeof msg.content !== 'string') continue;
      const role = msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';
      normalized.push({ role, content: msg.content });
    }
  }
  if (!normalized.length && systemPrompt) normalized.push({ role: 'system', content: String(systemPrompt) });
  if (!normalized.length && userPrompt) normalized.push({ role: 'user', content: String(userPrompt) });
  if (normalized.length && systemPrompt && normalized[0].role !== 'system') {
    normalized.unshift({ role: 'system', content: String(systemPrompt) });
  }
  if (!normalized.length) throw Object.assign(new Error('No LLM messages provided'), { code: 'LLM_MESSAGES_REQUIRED' });
  return normalized;
}

async function callOpenAI({ messages, temperature, top_p, model }) {
  if (!openaiClient) {
    throw Object.assign(new Error('OpenAI client is not configured'), { code: 'OPENAI_DISABLED' });
  }

  const completion = await openaiClient.chat.completions.create({
    model: model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    messages,
    temperature,
    top_p,
  });

  const message = completion?.choices?.[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  if (!content.trim()) throw Object.assign(new Error('OpenAI returned an empty response'), { code: 'AI_EMPTY_RESPONSE' });

  return {
    provider: 'openai',
    model: completion?.model || model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    message: { role: message.role || 'assistant', content },
    raw: completion,
  };
}

async function callOllama({ messages, temperature, top_p, model, baseUrl, requestTag }) {
  const endpoint = `${baseUrl}/api/chat`;
  const payload = {
    model,
    stream: false,
    messages,
    options: {
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      top_p: typeof top_p === 'number' ? top_p : 0.9,
    },
  };

  console.log('[llm] calling Ollama', { endpoint, model, requestTag, messageCount: messages.length, options: payload.options });

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('[llm] Ollama connection failed', { endpoint, model, requestTag, error: error?.message || error });
    throw Object.assign(new Error('Failed to connect to Ollama service'), {
      code: 'OLLAMA_UNREACHABLE',
      details: { endpoint, originalError: error?.message || String(error) },
    });
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error('[llm] Ollama invalid JSON response', { endpoint, status: response.status, requestTag });
    throw Object.assign(new Error('Invalid JSON response from Ollama'), {
      code: 'OLLAMA_BAD_RESPONSE',
      details: { endpoint, status: response.status },
    });
  }

  if (!response.ok) {
    console.error('[llm] Ollama non-OK response', { endpoint, status: response.status, requestTag, body: data });
    throw Object.assign(new Error(data?.error || 'Ollama request failed'), {
      code: 'OLLAMA_HTTP_ERROR',
      status: response.status,
      details: data,
    });
  }

  const content = data?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    console.error('[llm] Ollama empty message content', { endpoint, status: response.status, requestTag, body: data });
    throw Object.assign(new Error('Ollama returned an empty response'), { code: 'AI_EMPTY_RESPONSE' });
  }

  return {
    provider: 'ollama',
    model,
    message: { role: 'assistant', content },
    raw: data,
  };
}

async function callLLM({
  messages,
  systemPrompt,
  userPrompt,
  temperature,
  top_p,
  requestTag = 'general',
  model,
} = {}) {
  const providerSettings = getLlmProviderSettings();
  const normalizedMessages = normalizeMessages({ messages, systemPrompt, userPrompt });

  console.log('[llm] request started', {
    provider: providerSettings.provider,
    requestTag,
    model: providerSettings.useOllama ? providerSettings.ollamaModel : process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    messages: normalizedMessages.length,
  });

  if (!providerSettings.useOllama) {
    return callOpenAI({ messages: normalizedMessages, temperature, top_p, model });
  }

  return callOllama({
    messages: normalizedMessages,
    temperature,
    top_p,
    requestTag,
    model: model || providerSettings.ollamaModel,
    baseUrl: providerSettings.ollamaBaseUrl,
  });
}

module.exports = {
  callLLM,
  getLlmProviderSettings,
};
