import { createTransporter, getFromAddress } from '../../lib/mailer';

export async function POST(request: Request) {
  const { email, userId, reason, message } = await request.json();
  const { transporter, error } = createTransporter();

  if (error) {
    console.error('account deletion form error', error);
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 500,
    });
  }

  try {
    const text = `Email: ${email}\nUser ID: ${userId}\nReason: ${reason}\nMessage: ${message}`;

    await transporter.sendMail({
      from: getFromAddress(),
      replyTo: email,
      to: 'info.eltx@gmail.com',
      subject: 'Account Deletion Request',
      text,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (sendError) {
    console.error('account deletion form error', sendError);
    return new Response(JSON.stringify({ error: 'Email failed to send' }), {
      status: 500,
    });
  }
}
