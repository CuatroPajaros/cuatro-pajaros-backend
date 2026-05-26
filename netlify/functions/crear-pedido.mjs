export default async (request) => {
  // Solo permitir POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const pedido = await request.json();

    // Validar datos requeridos
    if (!pedido.nombre_cliente || !pedido.email || !pedido.telefono ||
        !pedido.direccion || !pedido.Localidad) {
      return new Response(JSON.stringify({
        error: 'Faltan datos requeridos',
        required: ['nombre_cliente', 'email', 'telefono', 'direccion', 'Localidad']
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const AIRTABLE_BASE_ID = 'appHc3E8X4q0kdps0';
    const AIRTABLE_TABLE_ID = 'tblLfvkCVikoR3vt1';
    const AIRTABLE_API_KEY = 'patmRW5Nz1yJTEOmfBE6ozW5jl1UllSsbuQuchUjYAGsWTf9m3rwhWvcMOpLaSS3GkGaXEpPnNCiJRF6cD1rjrtHtykO1au1KNToLONd99ZJSRnyEXlM';

    // Construir el registro usando Field IDs (Airtable requiere IDs en lugar de nombres)
    const record = {
      fields: {
        'fldyWUX7pJo62sc3c': pedido.nombre_cliente,        // nombre_cliente
        'fldwVpsz2Qfl6Zrzf': pedido.email,                  // email
        'fldmddUSROBNmfUU9': pedido.telefono,               // telefono
        'flduOyuBmNCs402qe': pedido.direccion,             // direccion
        'fld3lYy1RKtrF5JFK': pedido.Localidad,             // Localidad
        'fldUjgcSInu4vIO3c': pedido.notas_adicionales || '', // notas_adicionales
        'fldFquamDL72OY3ED': pedido.charms_detalles || '',  // charms_detalles
        'fldFkBXdCipH1XWZH': pedido.total || 0,             // total
        'fld2Ho4dKREFcCfcC': pedido.estado || 'Pedido Solicitado', // estado
        'fldN0VWlkUScEvs0a': new Date().toISOString()      // fecha
      }
    };

    // Llamar a Airtable desde el servidor
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

    const airtableResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records: [record] })
    });

    const responseData = await airtableResponse.json();

    if (!airtableResponse.ok) {
      console.error('❌ Error de Airtable:', responseData);
      return new Response(JSON.stringify({
        error: 'Error al crear el pedido en Airtable',
        details: responseData.error?.message || responseData.error || 'Error desconocido'
      }), {
        status: airtableResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Pedido creado en Airtable:', responseData.id);

    return new Response(JSON.stringify({
      success: true,
      recordId: responseData.id,
      message: 'Pedido creado exitosamente'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error en función:', error);
    return new Response(JSON.stringify({
      error: 'Error al procesar el pedido',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
