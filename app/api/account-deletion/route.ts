import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  const { email, userId, reason, message } = await request.json();

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const text = `Email: ${email}\nUser ID: ${userId}\nReason: ${reason}\nMessage: ${message}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      replyTo: email,
      to: 'info.eltx@gmail.com',
      subject: 'Account Deletion Request',
      text,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error('account deletion form error', error);
    return new Response(JSON.stringify({ error: 'Email failed to send' }), {
      status: 500,
    });
  }
}
