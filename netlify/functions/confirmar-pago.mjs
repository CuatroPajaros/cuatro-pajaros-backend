export default async (request) => {
  // Solo permitir PATCH
  if (request.method !== 'PATCH') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { recordId } = await request.json();

    if (!recordId) {
      return new Response(JSON.stringify({
        error: 'Falta el ID del registro (recordId)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const AIRTABLE_BASE_ID = 'appHc3E8X4q0kdps0';
    const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

    if (!AIRTABLE_API_KEY) {
      return new Response(JSON.stringify({
        error: 'Airtable API key not configured'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Actualizar el registro con estado de pago confirmado
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;

    const airtableResponse = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'fld2Ho4dKREFcCfcC': 'Pago Confirmado por Cliente',  // estado
          'fldEdLHa16U286Hso': new Date().toISOString()        // Timestamp Confirmación Pago
        }
      })
    });

    const responseData = await airtableResponse.json();

    if (!airtableResponse.ok) {
      console.error('❌ Error de Airtable al confirmar pago:', responseData);
      return new Response(JSON.stringify({
        error: 'Error al confirmar el pago',
        details: responseData.error?.message || responseData.error || 'Error desconocido'
      }), {
        status: airtableResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Pago confirmado en Airtable:', recordId);

    return new Response(JSON.stringify({
      success: true,
      message: 'Pago confirmado exitosamente'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error en función:', error);
    return new Response(JSON.stringify({
      error: 'Error al confirmar el pago',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
