import OpenAI from 'openai';

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ai endpoint error', 'OPENAI_API_KEY missing');
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500,
    });
  }

  const { messages } = await request.json();
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
    });

    return new Response(
      JSON.stringify({ message: completion.choices[0].message }),
      { status: 200 }
    );
  } catch (error) {
    console.error('ai endpoint error', error);
    return new Response(JSON.stringify({ error: 'AI request failed' }), { status: 500 });
  }
}
