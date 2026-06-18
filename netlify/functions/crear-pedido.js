const https = require('https');

const AIRTABLE_BASE_ID  = 'appHc3E8X4q0kdps0';
const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY;

const F = {
  nombre_cliente:    'fldyWUX7pJo62sc3c',
  numero_pedido:     'fldjztgomIIc4ms3U',
  email:             'fldwVpsz2Qfl6Zrzf',
  telefono:          'fldmddUSROBNmfUU9',
  direccion:         'flduOyuBmNCs402qe',
  Localidad:         'fld3lYy1RKtrF5JFK',
  tamanio_journal:   'fld19Qdx6S0OFGAiU',
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
      path, method,
      headers: {
        'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
        'Content-Type':  'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function generarNumeroPedido() {
  const now    = new Date();
  const dd     = String(now.getDate()).padStart(2,'0');
  const mm     = String(now.getMonth()+1).padStart(2,'0');
  const yy     = String(now.getFullYear()).slice(-2);
  const sufijo = `${dd}${mm}${yy}`;
  try {
    const filter = encodeURIComponent(`FIND("${sufijo}", {numero_pedido})`);
    const path   = `/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${filter}&fields%5B%5D=numero_pedido`;
    const res    = await httpsRequest('GET', path, null);
    const count  = (res.body.records || []).length + 1;
    return String(count).padStart(2,'0') + '-' + sufijo;
  } catch (e) {
    return String(Math.floor(Math.random()*90)+10) + '-' + sufijo;
  }
}

function setField(fields, fieldId, value, type) {
  if (type === 'number') {
    const n = Number(value);
    if (!isNaN(n)) fields[fieldId] = n;
  } else if (type === 'singleSelect') {
    if (value && String(value).trim()) fields[fieldId] = String(value).trim();
  } else {
    // text / multilineText
    const s = value != null ? String(value).trim() : '';
    if (s) fields[fieldId] = s;
  }
}

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, body: 'Method not allowed' };

  try {
    const p = JSON.parse(event.body || '{}');
    const numero_pedido = await generarNumeroPedido();
    console.log('Creando pedido:', numero_pedido, JSON.stringify(p).slice(0,200));

    const fields = {};

    // Texto obligatorio
    fields[F.nombre_cliente] = p.nombre_cliente || '';
    fields[F.numero_pedido]  = numero_pedido;
    fields[F.email]          = p.email || '';
    fields[F.estado]         = 'Journal Diseñado';
    fields[F.fecha]          = new Date().toISOString();

    // Texto opcional — solo si vienen con valor
    setField(fields, F.telefono,          p.telefono,          'text');
    setField(fields, F.direccion,         p.direccion,         'text');
    setField(fields, F.Localidad,         p.Localidad,         'text');
    setField(fields, F.tamanio_journal,   p.tamanio_journal || p['tamaño_journal'], 'text');
    setField(fields, F.color_cuero,       p.color_cuero,       'text');
    setField(fields, F.color_cordon,      p.color_cordon,      'text');
    setField(fields, F.color_ojales,      p.color_ojales,      'text');
    setField(fields, F.charm1_detalles,   p.charm1_detalles,   'text');
    setField(fields, F.charm2_detalles,   p.charm2_detalles,   'text');
    setField(fields, F.charm3_detalles,   p.charm3_detalles,   'text');
    setField(fields, F.charm4_detalles,   p.charm4_detalles,   'text');
    setField(fields, F.libretas_detalles, p.libretas_detalles, 'text');
    setField(fields, F.notas_adicionales, p.notas_adicionales, 'text');
    setField(fields, F.descuento_codigo,  p.descuento_codigo,  'text');

    // Libreta_Cantidad es multilineText — enviar como string
    const libCant = p.Libreta_Cantidad != null ? String(p.Libreta_Cantidad) : '';
    if (libCant) fields[F.Libreta_Cantidad] = libCant;

    // singleSelect
    const pochette = p.pochette === true || p.pochette === 'Sí' ? 'Sí' : 'No';
    fields[F.pochette] = pochette;

    // Números
    setField(fields, F.precio_journal,  p.precio_journal,  'number');
    setField(fields, F.Total_charms,    p.Total_charms,    'number');
    setField(fields, F.descuento_monto, p.descuento_monto, 'number');
    setField(fields, F.total,           p.total,           'number');

    // Timestamps opcionales
    if (p.timestamp_creacion_pedido) fields[F.timestamp_creacion] = p.timestamp_creacion_pedido;

    console.log('Fields a enviar:', JSON.stringify(fields).slice(0,400));

    const path = `/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;
    const res  = await httpsRequest('POST', path, { fields });

    console.log('Airtable status:', res.status, JSON.stringify(res.body).slice(0,300));

    if (res.status !== 200) {
      return {
        statusCode: 500, headers: CORS,
        body: JSON.stringify({ error: 'Error guardando en Airtable', details: res.body })
      };
    }

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ recordId: res.body.id, numero_pedido })
    };

  } catch (err) {
    console.error('Handler error:', err.message, err.stack);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
