// Usa fetch nativo de Node 18 (disponible en Netlify Functions)

const AIRTABLE_BASE_ID  = 'appHc3E8X4q0kdps0';
const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
const AIRTABLE_API_KEY  = 'patmRW5Nz1yJTEOmfBE6ozW5jl1UllSsbuQuchUjYAGsWTf9m3rwhWvcMOpLaSS3GkGaXEpPnNCiJRF6cD1rjrtHtykO1au1KNToLONd99ZJSRnyEXlM';
const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;
const HEADERS = { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' };

async function generarNumeroPedido() {
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2,'0');
  const mm   = String(now.getMonth()+1).padStart(2,'0');
  const yy   = String(now.getFullYear()).slice(-2);
  const sufijo = `${dd}${mm}${yy}`;
  try {
    const filter = encodeURIComponent(`FIND("${sufijo}", {numero_pedido})`);
    const res  = await fetch(`${AIRTABLE_URL}?filterByFormula=${filter}&fields%5B%5D=numero_pedido`, { headers: HEADERS });
    const data = await res.json();
    const seq  = String((data.records || []).length + 1).padStart(2,'0');
    return `${seq}-${sufijo}`;
  } catch(e) {
    console.error('Error generando numero_pedido:', e);
    return `${String(Math.floor(Math.random()*90)+10)}-${sufijo}`;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: ''
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const pedido = JSON.parse(event.body);
    console.log('Pedido recibido:', JSON.stringify(Object.keys(pedido)));

    const numero_pedido = await generarNumeroPedido();

    // Nota: Libreta_Cantidad es multilineText en Airtable → enviar como string
    const fields = {
      nombre_cliente:    pedido.nombre_cliente || '',
      email:             pedido.email || '',
      telefono:          pedido.telefono || '',
      direccion:         pedido.direccion || '',
      Localidad:         pedido.Localidad || '',
      numero_pedido,
      tamaño_journal:    pedido.tamaño_journal || '',
      color_cuero:       pedido.color_cuero || '',
      color_ojales:      pedido.color_ojales || '',
      color_cordon:      pedido.color_cordon || '',
      libretas_detalles: pedido.libretas_detalles || '',
      Libreta_Cantidad:  String(pedido.Libreta_Cantidad || '0'),
      charm1_detalles:   pedido.charm1_detalles || '',
      charm2_detalles:   pedido.charm2_detalles || '',
      charm3_detalles:   pedido.charm3_detalles || '',
      charm4_detalles:   pedido.charm4_detalles || '',
      pochette:          pedido.pochette || 'No',
      notas_adicionales: pedido.notas_adicionales || '',
      descuento_codigo:  pedido.descuento_codigo || '',
      descuento_monto:   Number(pedido.descuento_monto) || 0,
      precio_journal:    Number(pedido.precio_journal) || 0,
      Total_charms:      Number(pedido.Total_charms) || 0,
      total:             Number(pedido.total) || 0,
      estado:            'Pedido Solicitado',
    };

    // Campos de fecha solo si tienen valor válido
    if (pedido.fecha) fields.fecha = pedido.fecha;
    if (pedido.timestamp_creacion_pedido) {
      fields['Timestamp Creación Pedido'] = pedido.timestamp_creacion_pedido;
    }

    console.log('Enviando a Airtable fields:', JSON.stringify(Object.keys(fields)));

    const res  = await fetch(AIRTABLE_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fields })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Airtable error response:', JSON.stringify(data));
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Error guardando en Airtable', details: JSON.stringify(data) })
      };
    }

    console.log('✅ Pedido creado:', data.id, 'numero:', numero_pedido);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ recordId: data.id, numero_pedido })
    };

  } catch(err) {
    console.error('Handler error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
