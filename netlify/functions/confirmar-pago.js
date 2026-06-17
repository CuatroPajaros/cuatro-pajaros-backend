// Usa fetch nativo de Node 18

const AIRTABLE_BASE_ID  = 'appHc3E8X4q0kdps0';
const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
const AIRTABLE_API_KEY  = 'patmRW5Nz1yJTEOmfBE6ozW5jl1UllSsbuQuchUjYAGsWTf9m3rwhWvcMOpLaSS3GkGaXEpPnNCiJRF6cD1rjrtHtykO1au1KNToLONd99ZJSRnyEXlM';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'PATCH,OPTIONS' },
    body: ''
  };
  if (event.httpMethod !== 'PATCH') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { recordId } = JSON.parse(event.body);
    if (!recordId) return { statusCode: 400, body: JSON.stringify({ error: 'recordId requerido' }) };

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
    const res  = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          estado: 'Pago OK',
          'Timestamp Confirmación Pago': new Date().toISOString()
        }
      })
    });
    const data = await res.json();

    if (!res.ok) {
      console.error('Airtable error:', JSON.stringify(data));
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin':'*' }, body: JSON.stringify({ error: 'Error Airtable', details: JSON.stringify(data) }) };
    }
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin':'*' }, body: JSON.stringify({ ok: true }) };

  } catch(err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin':'*' }, body: JSON.stringify({ error: err.message }) };
  }
};
