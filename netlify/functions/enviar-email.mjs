const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'Cuatro Pájaros Atelier <hola@cuatropajaros.com>';

export async function enviarEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY no configurada');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to, subject, html })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Error Resend:', data);
    throw new Error(data.message || 'Error enviando email');
  }

  console.log('✅ Email enviado a:', to, '| ID:', data.id);
  return data;
}

export function emailPedidoRegistrado({ nombre, numeroPedido, total, items }) {
  return {
    subject: `✅ Recibimos tu pedido #${numeroPedido} — Cuatro Pájaros Atelier`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:Georgia,serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a1a1a;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;letter-spacing:3px;">CUATRO PÁJAROS</h1>
      <p style="color:#c9a96e;margin:8px 0 0;font-size:12px;letter-spacing:2px;">ATELIER</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:400;margin:0 0 16px;">Hola ${nombre},</h2>
      <p style="color:#555;line-height:1.7;margin:0 0 24px;">Recibimos tu pedido y estamos muy emocionadas de hacerlo para ti. En las próximas horas te escribiremos para coordinar el pago.</p>

      <div style="background:#f9f6f1;border-radius:4px;padding:24px;margin:0 0 24px;">
        <p style="color:#1a1a1a;margin:0 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Número de pedido</p>
        <p style="color:#c9a96e;font-size:24px;margin:0;font-weight:700;">#${numeroPedido}</p>
      </div>

      ${items ? `
      <div style="margin:0 0 24px;">
        <p style="color:#1a1a1a;margin:0 0 12px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Resumen de tu pedido</p>
        <p style="color:#555;line-height:1.7;margin:0;">${items}</p>
      </div>
      ` : ''}

      <div style="border-top:1px solid #eee;padding-top:24px;margin-top:8px;">
        <p style="color:#1a1a1a;margin:0 0 4px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Total</p>
        <p style="color:#1a1a1a;font-size:20px;margin:0;font-weight:700;">$${total ? Number(total).toLocaleString('es-CO') : '—'} COP</p>
      </div>

      <p style="color:#888;line-height:1.7;margin:32px 0 0;font-size:14px;">Si tienes alguna pregunta, escríbenos a <a href="mailto:hola@cuatropajaros.com" style="color:#c9a96e;">hola@cuatropajaros.com</a> o por Instagram <a href="https://instagram.com/cuatropajaros.co" style="color:#c9a96e;">@cuatropajaros.co</a></p>
    </div>
    <div style="background:#1a1a1a;padding:24px 40px;text-align:center;">
      <p style="color:#888;margin:0;font-size:12px;">© Cuatro Pájaros Atelier · Bogotá, Colombia</p>
    </div>
  </div>
</body>
</html>`
  };
}

export function emailPagoConfirmado({ nombre, numeroPedido }) {
  return {
    subject: `💛 Tu pago fue confirmado — Pedido #${numeroPedido}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:Georgia,serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a1a1a;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;letter-spacing:3px;">CUATRO PÁJAROS</h1>
      <p style="color:#c9a96e;margin:8px 0 0;font-size:12px;letter-spacing:2px;">ATELIER</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:400;margin:0 0 16px;">¡Tu pago fue confirmado, ${nombre}!</h2>
      <p style="color:#555;line-height:1.7;margin:0 0 24px;">Confirmamos la recepción de tu pago. Tu pedido ya está en producción y lo haremos con mucho cariño.</p>

      <div style="background:#f9f6f1;border-radius:4px;padding:24px;margin:0 0 24px;">
        <p style="color:#1a1a1a;margin:0 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Número de pedido</p>
        <p style="color:#c9a96e;font-size:24px;margin:0;font-weight:700;">#${numeroPedido}</p>
      </div>

      <p style="color:#555;line-height:1.7;margin:0;">Cuando tu pedido esté listo para envío te avisaremos con el número de guía.</p>

      <p style="color:#888;line-height:1.7;margin:32px 0 0;font-size:14px;">¿Preguntas? Escríbenos a <a href="mailto:hola@cuatropajaros.com" style="color:#c9a96e;">hola@cuatropajaros.com</a></p>
    </div>
    <div style="background:#1a1a1a;padding:24px 40px;text-align:center;">
      <p style="color:#888;margin:0;font-size:12px;">© Cuatro Pájaros Atelier · Bogotá, Colombia</p>
    </div>
  </div>
</body>
</html>`
  };
}

export function emailPedidoEnviado({ nombre, numeroPedido, guia }) {
  return {
    subject: `📦 Tu pedido #${numeroPedido} está en camino`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:Georgia,serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a1a1a;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;letter-spacing:3px;">CUATRO PÁJAROS</h1>
      <p style="color:#c9a96e;margin:8px 0 0;font-size:12px;letter-spacing:2px;">ATELIER</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:400;margin:0 0 16px;">¡Tu pedido está en camino, ${nombre}!</h2>
      <p style="color:#555;line-height:1.7;margin:0 0 24px;">Tu pedido salió de nuestro taller y está en manos de la transportadora. Pronto llegará a ti.</p>

      <div style="background:#f9f6f1;border-radius:4px;padding:24px;margin:0 0 24px;">
        <p style="color:#1a1a1a;margin:0 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Número de pedido</p>
        <p style="color:#c9a96e;font-size:24px;margin:0 0 16px;font-weight:700;">#${numeroPedido}</p>
        ${guia ? `
        <p style="color:#1a1a1a;margin:0 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Número de guía</p>
        <p style="color:#1a1a1a;font-size:18px;margin:0;font-weight:700;">${guia}</p>
        ` : ''}
      </div>

      <p style="color:#555;line-height:1.7;margin:0;">Esperamos que lo ames tanto como nosotras lo hicimos. 💛</p>

      <p style="color:#888;line-height:1.7;margin:32px 0 0;font-size:14px;">¿Algún inconveniente con tu envío? Escríbenos a <a href="mailto:hola@cuatropajaros.com" style="color:#c9a96e;">hola@cuatropajaros.com</a></p>
    </div>
    <div style="background:#1a1a1a;padding:24px 40px;text-align:center;">
      <p style="color:#888;margin:0;font-size:12px;">© Cuatro Pájaros Atelier · Bogotá, Colombia</p>
    </div>
  </div>
</body>
</html>`
  };
}

export function emailPagoRegistrado({ nombre, numeroPedido }) {
  return {
    subject: `📸 Recibimos tu comprobante — Pedido #${numeroPedido}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:Georgia,serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a1a1a;padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;letter-spacing:3px;">CUATRO PÁJAROS</h1>
      <p style="color:#c9a96e;margin:8px 0 0;font-size:12px;letter-spacing:2px;">ATELIER</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:400;margin:0 0 16px;">Hola ${nombre},</h2>
      <p style="color:#555;line-height:1.7;margin:0 0 24px;">Recibimos tu comprobante de pago para el pedido <strong>#${numeroPedido}</strong>. Lo verificaremos y te confirmaremos en breve.</p>

      <p style="color:#888;line-height:1.7;margin:32px 0 0;font-size:14px;">¿Preguntas? Escríbenos a <a href="mailto:hola@cuatropajaros.com" style="color:#c9a96e;">hola@cuatropajaros.com</a></p>
    </div>
    <div style="background:#1a1a1a;padding:24px 40px;text-align:center;">
      <p style="color:#888;margin:0;font-size:12px;">© Cuatro Pájaros Atelier · Bogotá, Colombia</p>
    </div>
  </div>
</body>
</html>`
  };
}
