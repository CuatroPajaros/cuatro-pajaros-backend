const https = require('https');

const AIRTABLE_BASE_ID  = 'appHc3E8X4q0kdps0';
const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
const AIRTABLE_API_KEY  = 'patmRW5Nz1yJTEOmfBE6ozW5jl1UllSsbuQuchUjYAGsWTf9m3rwhWvcMOpLaSS3GkGaXEpPnNCiJRF6cD1rjrtHtykO1au1KNToLONd99ZJSRnyEXlM';

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

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'PATCH, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'PATCH')   return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { recordId } = JSON.parse(event.body);
    if (!recordId) return { statusCode: 400, body: JSON.stringify({ error: 'recordId requerido' }) };

    const path = `/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
    const res  = await httpsRequest('PATCH', path, {
      fields: {
        'fld2Ho4dKREFcCfcC': 'Pago OK',
        'fldEdLHa16U286Hso': new Date().toISOString()
      }
    });

    if (res.status !== 200) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Error Airtable', details: JSON.stringify(res.body) }) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
