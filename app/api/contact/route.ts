import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  const { email, message } = await request.json();

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: email,
    to: 'info.eltx@gmail.com',
    subject: 'Contact Form',
    text: message,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
