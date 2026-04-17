const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export function getLlmRuntime() {
  const useOllama = parseBoolean(process.env.USE_OLLAMA, true);
  return {
    useOllama,
    provider: useOllama ? 'ollama' : 'openai',
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3.5:2b',
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
  };
}

function normalizeMessages(messages: unknown): LlmMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((msg) => {
      if (!msg || typeof msg !== 'object') return null;
      const role = (msg as { role?: string }).role;
      const content = (msg as { content?: string }).content;
      if (typeof content !== 'string' || !content.trim()) return null;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') return null;
      return { role, content } as LlmMessage;
    })
    .filter((msg): msg is LlmMessage => Boolean(msg));
}

export function extractJsonObject(rawText: string) {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const maybe = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(maybe);
    }
    throw new Error('Could not parse JSON from model response');
  }
}

export async function callLLM({
  messages,
  temperature = 0.2,
  top_p = 0.9,
}: {
  messages: unknown;
  temperature?: number;
  top_p?: number;
}) {
  const runtime = getLlmRuntime();
  const normalizedMessages = normalizeMessages(messages);

  if (!normalizedMessages.length) {
    throw Object.assign(new Error('Invalid messages payload'), { code: 'BAD_MESSAGES' });
  }

  if (runtime.useOllama) {
    const endpoint = `${runtime.ollamaBaseUrl}/api/chat`;
    const body = {
      model: runtime.ollamaModel,
      stream: false,
      messages: normalizedMessages,
      options: { temperature, top_p },
    };

    console.log('[app/api/ai] Ollama request', { endpoint, model: runtime.ollamaModel, messageCount: normalizedMessages.length });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!response.ok) {
      console.error('[app/api/ai] Ollama error', { status: response.status, data });
      throw Object.assign(new Error(data?.error || 'Ollama request failed'), { code: 'OLLAMA_HTTP_ERROR', status: response.status });
    }

    const content = data?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw Object.assign(new Error('Ollama returned empty content'), { code: 'AI_EMPTY_RESPONSE' });
    }

    return {
      provider: 'ollama' as const,
      model: runtime.ollamaModel,
      message: { role: 'assistant' as const, content },
    };
  }

  if (!runtime.hasOpenAiKey) {
    throw Object.assign(new Error('OPENAI_API_KEY missing'), { code: 'OPENAI_DISABLED' });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: DEFAULT_OPENAI_MODEL, messages: normalizedMessages, temperature, top_p }),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error('[app/api/ai] OpenAI error', { status: response.status, data });
    throw Object.assign(new Error(data?.error?.message || 'OpenAI request failed'), { code: 'OPENAI_HTTP_ERROR', status: response.status });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw Object.assign(new Error('OpenAI returned empty content'), { code: 'AI_EMPTY_RESPONSE' });
  }

  return {
    provider: 'openai' as const,
    model: data?.model || DEFAULT_OPENAI_MODEL,
    message: { role: 'assistant' as const, content },
  };
}
