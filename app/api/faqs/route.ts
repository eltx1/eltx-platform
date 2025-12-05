import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  createdAt: string;
}

const filePath = path.join(process.cwd(), 'data', 'faqs.json');

async function readFaqs(): Promise<FaqItem[]> {
  try {
    const file = await fs.readFile(filePath, 'utf8');
    return JSON.parse(file) as FaqItem[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeFaqs(faqs: FaqItem[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(faqs, null, 2));
}

function validatePayload(body: any) {
  const question = (body?.question || '').toString().trim();
  const answer = (body?.answer || '').toString().trim();
  if (!question || !answer) {
    return { error: 'Question and answer are required' } as const;
  }
  return { question, answer } as const;
}

export async function GET() {
  const faqs = await readFaqs();
  return NextResponse.json({ faqs });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const payload = validatePayload(body);
  if ('error' in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const faqs = await readFaqs();
  const faq: FaqItem = {
    id: Date.now(),
    question: payload.question,
    answer: payload.answer,
    createdAt: new Date().toISOString(),
  };
  await writeFaqs([...faqs, faq]);
  return NextResponse.json({ faq });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ error: 'FAQ id is required' }, { status: 400 });
  }
  const payload = validatePayload(body);
  if ('error' in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const faqs = await readFaqs();
  const idx = faqs.findIndex((item) => item.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'FAQ not found' }, { status: 404 });
  }
  const updated: FaqItem = {
    ...faqs[idx],
    question: payload.question,
    answer: payload.answer,
  };
  faqs[idx] = updated;
  await writeFaqs(faqs);
  return NextResponse.json({ faq: updated });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ error: 'FAQ id is required' }, { status: 400 });
  }
  const faqs = await readFaqs();
  const filtered = faqs.filter((faq) => faq.id !== id);
  if (filtered.length === faqs.length) {
    return NextResponse.json({ error: 'FAQ not found' }, { status: 404 });
  }
  await writeFaqs(filtered);
  return NextResponse.json({ ok: true });
}
