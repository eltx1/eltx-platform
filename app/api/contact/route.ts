import { createTransporter, getFromAddress } from '../../lib/mailer';

export async function POST(request: Request) {
  const { email, message } = await request.json();
  const { transporter, error } = createTransporter();

  if (error) {
    console.error('contact form error', error);
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 500,
    });
  }

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      replyTo: email,
      to: 'info.eltx@gmail.com',
      subject: 'Contact Form',
      text: message,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (sendError) {
    console.error('contact form error', sendError);
    return new Response(JSON.stringify({ error: 'Email failed to send' }), {
      status: 500,
    });
  }
}
