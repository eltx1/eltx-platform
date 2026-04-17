import { callLLM, extractJsonObject } from '../../lib/llm';

const JSON_ONLY_SYSTEM_PROMPT = [
  'You are a strict JSON generator.',
  'Return valid JSON only with no markdown and no extra text.',
  'If unsure, return: {"ok":false,"reason":"not_enough_info"}.',
  'Example input: "name=Ali, age=21".',
  'Example output: {"ok":true,"name":"Ali","age":21}.',
].join(' ');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, expect_json } = body || {};

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 });
    }

    const mergedMessages = expect_json
      ? [{ role: 'system', content: JSON_ONLY_SYSTEM_PROMPT }, ...messages]
      : messages;

    const result = await callLLM({
      messages: mergedMessages,
      temperature: typeof body?.temperature === 'number' ? body.temperature : 0.2,
      top_p: typeof body?.top_p === 'number' ? body.top_p : 0.9,
    });

    if (expect_json) {
      try {
        const parsed = extractJsonObject(result.message.content);
        return new Response(JSON.stringify({ message: result.message, parsed, provider: result.provider, model: result.model }), {
          status: 200,
        });
      } catch (parseError) {
        console.error('ai endpoint JSON parse error', parseError);
        return new Response(
          JSON.stringify({
            error: 'Model returned invalid JSON',
            provider: result.provider,
            model: result.model,
            raw: result.message.content,
          }),
          { status: 502 }
        );
      }
    }

    return new Response(JSON.stringify({ message: result.message, provider: result.provider, model: result.model }), {
      status: 200,
    });
  } catch (error) {
    console.error('ai endpoint error', error);
    const message = error instanceof Error ? error.message : 'AI request failed';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
