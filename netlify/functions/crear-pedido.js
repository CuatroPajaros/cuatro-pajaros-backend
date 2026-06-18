const https = require('https');

const AIRTABLE_BASE_ID  = 'appHc3E8X4q0kdps0';
const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
const AIRTABLE_API_KEY  = 'patmRW5Nz1yJTEOmfBE6ozW5jl1UllSsbuQuchUjYAGsWTf9m3rwhWvcMOpLaSS3GkGaXEpPnNCiJRF6cD1rjrtHtykO1au1KNToLONd99ZJSRnyEXlM';

// Field IDs tabla Pedidos
const F = {
  nombre_cliente:    'fldyWUX7pJo62sc3c',
  numero_pedido:     'fldjztgomIIc4ms3U',
  email:             'fldwVpsz2Qfl6Zrzf',
  telefono:          'fldmddUSROBNmfUU9',
  direccion:         'flduOyuBmNCs402qe',
  Localidad:         'fld3lYy1RKtrF5JFK',
  tamaño_journal:    'fld19Qdx6S0OFGAiU',
  color_cuero:       'fld9CHgNndOyyqogs',
  color_cordon:      'fldVkKF0QZTZhs0sz',
  color_ojales:      'fldmAv2wyttj2RKXg',
  charm1_detalles:   'fldRKxoemvCk71yMF',
  charm2_detalles:   'fldggddNr7zNy3TFG',
  charm3_detalles:   'fld0Oyo3xz9evy8y8',
  charm4_detalles:   'fld7XUbsMA3smmxWa',
  libretas_detalles: 'fld2ufRUJ9zVx8O43',
  Libreta_Cantidad:  'fldQvMQDKdPHeSCvH',
  pochette:          'fldaX1NvwN8ltlQN1',
  notas_adicionales: 'fldUjgcSInu4vIO3c',
  precio_journal:    'fldMb2DdKbnHZMDLp',
  Total_charms:      'fldeNQA2MZglrMnRh',
  descuento_codigo:  'fld2UMLJ7ruZL6cqy',
  descuento_monto:   'fldv9YqqY54elqAVw',
  total:             'fldFkBXdCipH1XWZH',
  estado:            'fld2Ho4dKREFcCfcC',
  fecha:             'fldN0VWlkUScEvs0a',
  timestamp_creacion:'fldi7piFPEAwhhdBt',
};

function httpsRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.airtable.com',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function generarNumeroPedido() {
  const now    = new Date();
  const dd     = String(now.getDate()).padStart(2, '0');
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const yy     = String(now.getFullYear()).slice(-2);
  const sufijo = `${dd}${mm}${yy}`;
  try {
    const filter = encodeURIComponent(`FIND("${sufijo}", {numero_pedido})`);
    const path   = `/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${filter}&fields%5B%5D=numero_pedido`;
    const res    = await httpsRequest('GET', path, null);
    const count  = (res.body.records || []).length + 1;
    return String(count).padStart(2, '0') + '-' + sufijo;
  } catch (e) {
    console.error('Error generando numero_pedido:', e.message);
    return String(Math.floor(Math.random() * 90) + 10) + '-' + sufijo;
  }
}

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, body: 'Method not allowed' };

  try {
    const p = JSON.parse(event.body);
    const numero_pedido = await generarNumeroPedido();
    console.log('Creando pedido:', numero_pedido);

    const fields = {};
    fields[F.nombre_cliente]    = p.nombre_cliente    || '';
    fields[F.numero_pedido]     = numero_pedido;
    fields[F.email]             = p.email             || '';
    fields[F.telefono]          = p.telefono          || '';
    fields[F.direccion]         = p.direccion         || '';
    fields[F.Localidad]         = p.Localidad         || '';
    fields[F.tamaño_journal]    = p.tamaño_journal    || '';
    fields[F.color_cuero]       = p.color_cuero       || '';
    fields[F.color_cordon]      = p.color_cordon      || '';
    fields[F.color_ojales]      = p.color_ojales      || '';
    fields[F.charm1_detalles]   = p.charm1_detalles   || '';
    fields[F.charm2_detalles]   = p.charm2_detalles   || '';
    fields[F.charm3_detalles]   = p.charm3_detalles   || '';
    fields[F.charm4_detalles]   = p.charm4_detalles   || '';
    fields[F.libretas_detalles] = p.libretas_detalles || '';
    fields[F.Libreta_Cantidad]  = String(p.Libreta_Cantidad || 0);
    fields[F.pochette]          = p.pochette          || 'No';
    fields[F.notas_adicionales] = p.notas_adicionales || '';
    fields[F.descuento_codigo]  = p.descuento_codigo  || '';
    fields[F.descuento_monto]   = Number(p.descuento_monto) || 0;
    fields[F.precio_journal]    = Number(p.precio_journal)  || 0;
    fields[F.Total_charms]      = Number(p.Total_charms)    || 0;
    fields[F.total]             = Number(p.total)           || 0;
    fields[F.estado]            = 'Pedido Solicitado';
    fields[F.fecha]             = new Date().toISOString();
    if (p.timestamp_creacion_pedido) fields[F.timestamp_creacion] = p.timestamp_creacion_pedido;

    const path = `/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;
    const res  = await httpsRequest('POST', path, { fields });

    if (res.status !== 200) {
      console.error('Airtable error:', JSON.stringify(res.body));
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: 'Error guardando en Airtable', details: JSON.stringify(res.body) })
      };
    }

    console.log('Pedido OK:', res.body.id);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ recordId: res.body.id, numero_pedido })
    };

  } catch (err) {
    console.error('Handler error:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
