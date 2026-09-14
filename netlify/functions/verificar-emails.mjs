import { enviarEmail, emailPedidoRegistrado, emailPagoRegistrado, emailPagoConfirmado, emailPedidoEnviado } from './enviar-email.mjs';

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
  url.searchParams.set('fields[]', 'notif_pago_reg_enviada');
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

  // ETAPA 1: Bienvenida — diseño finalizado, pedido creado
  try {
    const registros = await fetchPedidos(
      `AND({estado} = 'Journal Diseñado', OR({notif_bienvenida_enviada} = FALSE(), {notif_bienvenida_enviada} = BLANK()))`
    );
    console.log(`📧 Bienvenidas pendientes: ${registros.length}`);

    for (const record of registros) {
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
        console.log(`✅ Bienvenida → ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Bienvenida → ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando etapa 1:', err.message);
    errors++;
  }

  // ETAPA 2: Comprobante recibido — cliente confirmó pago, pendiente de verificación
  try {
    const registros = await fetchPedidos(
      `AND({estado} = 'Pago Confirmado por Cliente', OR({notif_pago_reg_enviada} = FALSE(), {notif_pago_reg_enviada} = BLANK()))`
    );
    console.log(`📸 Comprobantes pendientes: ${registros.length}`);

    for (const record of registros) {
      const f = record.fields;
      if (!f.email) continue;
      try {
        const { subject, html } = emailPagoRegistrado({
          nombre: f.nombre_cliente || 'amiga',
          numeroPedido: f.numero_pedido || record.id
        });
        await enviarEmail({ to: f.email, subject, html });
        await markField(record.id, 'notif_pago_reg_enviada', true);
        processed++;
        console.log(`✅ Comprobante recibido → ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Comprobante → ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando etapa 2:', err.message);
    errors++;
  }

  // ETAPA 3: Pago confirmado — Fernanda verificó el pago
  try {
    const registros = await fetchPedidos(
      `AND({estado} = 'Pago OK', OR({notif_pago_enviada} = FALSE(), {notif_pago_enviada} = BLANK()))`
    );
    console.log(`💛 Confirmaciones de pago pendientes: ${registros.length}`);

    for (const record of registros) {
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
        console.log(`✅ Pago confirmado → ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Pago confirmado → ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando etapa 3:', err.message);
    errors++;
  }

  // ETAPA 4: Enviado — pedido despachado
  try {
    const registros = await fetchPedidos(
      `AND({estado} = 'Enviado', OR({notif_envio_enviada} = FALSE(), {notif_envio_enviada} = BLANK()))`
    );
    console.log(`📦 Notificaciones de envío pendientes: ${registros.length}`);

    for (const record of registros) {
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
        console.log(`✅ Enviado → ${f.email} (pedido #${f.numero_pedido})`);
      } catch (err) {
        console.error(`❌ Enviado → ${f.email}:`, err.message);
        errors++;
      }
    }
  } catch (err) {
    console.error('❌ Error consultando etapa 4:', err.message);
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
