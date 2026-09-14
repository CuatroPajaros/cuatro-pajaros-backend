import { enviarEmail, emailPedidoRegistrado, emailPagoConfirmado, emailPedidoEnviado } from './enviar-email.mjs';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appHc3E8X4q0kdps0';
const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';

async function fetchPedidos(filterFormula) {
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
  url.searchParams.set('filterByFormula', filterFormula);
  url.searchParams.set('fields[]', 'nombre_cliente');
  url.searchParams.set('fields[]', 'email');
  url.searchParams.set('fields[]', 'numero_pedido');
  url.searchParams.set('fields[]', 'total');
  url.searchParams.set('fields[]', 'estado');
  url.searchParams.set('fields[]', 'numero_guia');
  url.searchParams.set('fields[]', 'notif_bienvenida_enviada');
  url.searchParams.set('fields[]', 'notif_pago_enviada');
  url.searchParams.set('fields[]', 'notif_envio_enviada');

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Airtable error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.records || [];
}

async function markField(recordId, field, value = true) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: { [field]: value } })
  });

  if (!res.ok) {
    const err = await res.json();
    console.error(`❌ Error marcando ${field} en ${recordId}:`, err);
  }
}

async function procesarNotificaciones() {
  if (!AIRTABLE_API_KEY) {
    console.error('❌ AIRTABLE_API_KEY no configurada');
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errors = 0;

  // 1. Bienvenida: pedidos nuevos sin notificación enviada
  try {
    const pedidosBienvenida = await fetchPedidos(
      `AND({estado} = 'Pedido Solicitado', OR({notif_bienvenida_enviada} = FALSE(), {notif_bienvenida_enviada} = BLANK()))`
    );

    console.log(`📧 Bienvenidas pendientes: ${pedidosBienvenida.length}`);

    for (const record of pedidosBienvenida) {
      const f = record.fields;
      if (!f.email) continue;
      try {
        const { subject, html } = emailPedidoRegistrado({
          nombre: f.nombre_cliente || 'amiga',
          numeroPedido: f.numero_pedido || record.id,
          total: f.total || 0
        });
        await enviarEmail({ to: f.email, subject, html });
        await markField(record.id, 'notif_bienvenida_enviada', true);
        processed++;
        console.log(`✅ Bienvenida enviada a ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Error enviando bienvenida a ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando pedidos para bienvenida:', err.message);
    errors++;
  }

  // 2. Pago confirmado: sin notificación de pago enviada
  try {
    const pedidosPago = await fetchPedidos(
      `AND({estado} = 'Pago Confirmado por Cliente', OR({notif_pago_enviada} = FALSE(), {notif_pago_enviada} = BLANK()))`
    );

    console.log(`💳 Confirmaciones de pago pendientes: ${pedidosPago.length}`);

    for (const record of pedidosPago) {
      const f = record.fields;
      if (!f.email) continue;
      try {
        const { subject, html } = emailPagoConfirmado({
          nombre: f.nombre_cliente || 'amiga',
          numeroPedido: f.numero_pedido || record.id
        });
        await enviarEmail({ to: f.email, subject, html });
        await markField(record.id, 'notif_pago_enviada', true);
        processed++;
        console.log(`✅ Confirmación de pago enviada a ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Error enviando confirmación de pago a ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando pedidos para confirmación de pago:', err.message);
    errors++;
  }

  // 3. Enviado: pedido despachado sin notificación de envío
  try {
    const pedidosEnviados = await fetchPedidos(
      `AND({estado} = 'Enviado', OR({notif_envio_enviada} = FALSE(), {notif_envio_enviada} = BLANK()))`
    );

    console.log(`📦 Notificaciones de envío pendientes: ${pedidosEnviados.length}`);

    for (const record of pedidosEnviados) {
      const f = record.fields;
      if (!f.email) continue;
      try {
        const { subject, html } = emailPedidoEnviado({
          nombre: f.nombre_cliente || 'amiga',
          numeroPedido: f.numero_pedido || record.id,
          guia: f.numero_guia || null
        });
        await enviarEmail({ to: f.email, subject, html });
        await markField(record.id, 'notif_envio_enviada', true);
        processed++;
        console.log(`✅ Notificación de envío enviada a ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Error enviando notificación de envío a ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando pedidos enviados:', err.message);
    errors++;
  }

  return { processed, errors };
}

export default async (request) => {
  console.log('🔄 verificar-emails ejecutándose...');

  try {
    const resultado = await procesarNotificaciones();
    console.log(`✅ Completado: ${resultado.processed} emails enviados, ${resultado.errors} errores`);

    return new Response(JSON.stringify({
      success: true,
      ...resultado
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('❌ Error fatal en verificar-emails:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { schedule: '*/30 * * * *' };
