// Función para generar número de pedido secuencial (YYMMDD-01, YYMMDD-02, etc.)
async function generarNumeroPedido(AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_API_KEY) {
  const ahora = new Date();
  const año = ahora.getFullYear().toString().slice(-2);
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  const fechaHoy = `${año}${mes}${dia}`;

  try {
    // Consultar Airtable para obtener TODOS los registros
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?fields=numero_pedido`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('⚠️ Error en Airtable:', response.status, response.statusText);
      return `${fechaHoy}-01`;
    }

    const data = await response.json();
    const registros = data.records || [];

    console.log(`📊 Encontrados ${registros.length} registros en Airtable`);

    // Filtrar pedidos de hoy y extraer números
    const numerosHoy = registros
      .filter(r => {
        const numPedido = r.fields.numero_pedido || '';
        return numPedido.startsWith(fechaHoy);
      })
      .map(r => {
        const numPedido = r.fields.numero_pedido || '';
        const match = numPedido.match(new RegExp(`${fechaHoy}-(\\d+)$`));
        return match ? parseInt(match[1]) : 0;
      })
      .filter(n => n > 0);

    console.log(`📋 Números usados hoy (${fechaHoy}):`, numerosHoy);

    // Obtener el próximo número
    const proximoNumero = Math.max(0, ...numerosHoy) + 1;
    const numeroFormato = String(proximoNumero).padStart(2, '0');
    const numeroPedidoFinal = `${fechaHoy}-${numeroFormato}`;

    console.log(`✅ Nuevo número de pedido: ${numeroPedidoFinal}`);
    return numeroPedidoFinal;

  } catch (error) {
    console.error('❌ Error generando número secuencial:', error);
    return `${fechaHoy}-01`;
  }
}

// Función para obtener fecha/hora en zona horaria de Bogotá
function obtenerFechaBogota() {
  const ahora = new Date();
  // Convertir a hora de Bogotá (UTC-5)
  const bogota = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  return bogota.toISOString();
}

// Función para convertir un timestamp ISO a zona horaria de Bogotá
function convertirABogota(isoString) {
  if (!isoString) return obtenerFechaBogota();
  try {
    const fecha = new Date(isoString);
    const bogota = new Date(fecha.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    return bogota.toISOString();
  } catch (error) {
    console.warn('⚠️ Error convirtiendo timestamp a Bogotá:', error);
    return obtenerFechaBogota();
  }
}

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
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

    if (!AIRTABLE_API_KEY) {
      return new Response(JSON.stringify({
        error: 'Airtable API key not configured'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar número de pedido secuencial y timestamp en Bogotá
    const numeroPedido = await generarNumeroPedido(AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_API_KEY);
    const fechaBogota = obtenerFechaBogota();

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
        'fldSQAg6dsbW7HFC0': convertirABogota(new Date().toISOString()),                   // fecha_creacion_bogota (zona horaria Bogotá)
        // Campos de detalles del pedido con Field IDs correctos
        'fld19Qdx6S0OFGAiU': pedido.tamaño || '',           // tamaño_journal
        'fld9CHgNndOyyqogs': pedido.color_customer || '',   // color_cuero
        'fldmAv2wyttj2RKXg': pedido.color_ojeria || '',     // color_ojales
        'fldVkKF0QZTZhs0sz': pedido.color_cordon || '',     // color_cordon
        'fld2ufRUJ9zVx8O43': pedido.libretas_detalles || '', // libretas_detalles
        'fldaX1NvwN8ltlQN1': pedido.pochette || '',         // pochette
        // Campos de descuento
        'fld2UMLJ7ruZL6cqy': pedido.descuento_codigo || '', // descuento_codigo
        'fldv9YqqY54elqAVw': pedido.descuento_monto || 0,   // descuento_monto
        // Número de pedido
        'fldjztgomIIc4ms3U': numeroPedido,                   // numero_pedido
        // Timestamp de creación (convertir a Bogotá)
        'fldi7piFPEAwhhdBt': convertirABogota(pedido.timestamp_creacion_pedido) // timestamp_creacion_pedido
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

    console.log('✅ Pedido creado en Airtable:', responseData.records[0].id);

    return new Response(JSON.stringify({
      success: true,
      recordId: responseData.records[0].id,
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
