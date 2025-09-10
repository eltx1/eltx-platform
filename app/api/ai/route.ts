import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const { messages } = await request.json();
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 });
  }

  const completion = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
  });

  return new Response(
    JSON.stringify({ message: completion.choices[0].message }),
    { status: 200 }
  );
}

