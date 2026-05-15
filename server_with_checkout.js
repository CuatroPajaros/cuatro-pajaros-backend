require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const csv = require('csv-parse/sync');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const axios = require('axios');

// Sistema de descuentos desde Airtable
const { validateCode, applyCode, getActiveCodes, calculateDiscount } = require('./airtableDiscounts');

const app = express();
app.use(cors());
app.use(express.json());

// Ruta base
const fotosPath = path.resolve(__dirname, '..');

// Servir archivos estáticos EXPLÍCITOS para cada carpeta
app.use('/CHARMS', express.static(path.join(fotosPath, 'CHARMS'), {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

app.use('/CORDONES', express.static(path.join(fotosPath, 'CORDONES'), {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

app.use('/CUERO', express.static(path.join(fotosPath, 'CUERO'), {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

// Servir todos los demás archivos estáticos
app.use(express.static(fotosPath));
app.use('/fotos', express.static(fotosPath));

console.log('📁 Rutas de imágenes configuradas:');
console.log('  /CHARMS ->', path.join(fotosPath, 'CHARMS'));
console.log('  /CORDONES ->', path.join(fotosPath, 'CORDONES'));
console.log('  /CUERO ->', path.join(fotosPath, 'CUERO'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB:', err.message));

// Sistema de descuentos desde local
console.log('🎁 Sistema de códigos de descuento activado (local)');

// Schema
const productSchema = new mongoose.Schema({
  _id: String,
  name: String,
  type: String,
  tags: [String],
  price: Number,
  stock: Number,
  color: String,
  image: String,
  active: Boolean
});

const Product = mongoose.model('Product', productSchema);

// Función para obtener datos desde Google Sheets (CSV público - sin autenticación)
async function getCharmsFromGoogleSheets() {
  try {
    console.log('📥 Descargando Google Sheet como CSV (sin autenticación)...');

    const spreadsheetId = '1Ed2d6dqnyc700gsF6oW-ZJP3hx32qNV31TSwszGEi3k';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`;

    console.log(`🔗 URL CSV: ${csvUrl}`);

    const response = await axios.get(csvUrl);
    const csvData = response.data;

    // Parsear CSV
    const rows = csv.parse(csvData, {
      columns: false,
      skip_empty_lines: true
    });

    if (rows.length === 0) {
      throw new Error('No data found in Google Sheets CSV');
    }

    // Primera fila son headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    console.log(`✅ CSV descargado exitosamente: ${dataRows.length} filas obtenidas`);
    console.log(`📋 Headers: ${headers.join(', ')}`);

    return { headers, dataRows };
  } catch (err) {
    console.error('❌ Error descargando CSV de Google Sheets:', err.message);
    throw err;
  }
}

// Función para parsear datos del Google Sheets API
function parseCharmsFromGoogleSheets(headers, dataRows) {
  // Mapear índices de columnas desde los headers
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header.trim()] = index;
  });

  console.log('📋 Headers encontrados:', Object.keys(headerMap).join(', '));
  console.log('📋 Headers RAW:', JSON.stringify(headers));
  console.log('🔍 Índice de TAGS:', headerMap['TAGS']);

  // Verificar que tenemos los headers esperados
  if (!headerMap['TAGS']) {
    console.warn('⚠️  ¡CRÍTICO! No se encontró la columna TAGS. Headers disponibles:', Object.keys(headerMap));
  }
  if (!headerMap['Foto_Referencia']) {
    console.warn('⚠️  No se encontró Foto_Referencia. Buscando alternativas...');
    // Buscar Foto_Referencia con variaciones
    const fotoKeys = Object.keys(headerMap).filter(k => k.includes('Foto') || k.includes('foto') || k.includes('Reference'));
    console.log('📸 Posibles columnas de foto:', fotoKeys);
  }

  return dataRows.map((row, index) => {
    // Acceder a los valores usando el índice del header
    const nombreCharm = row[headerMap['Nombre_Charm']] || '';
    const tagsStr = row[headerMap['TAGS']] || '';
    const stockStr = row[headerMap['Stock_Disponible']] || '0';
    const colorCharm = row[headerMap['Color']] || '';
    const tipoCharm = row[headerMap['TIPO']] || '';
    const precioStr = row[headerMap['Precio_Venta_COP']] || '20000';
    const fotoReferencia = row[headerMap['Foto_Referencia']] || '';

    // Solo procesar si hay nombre
    if (!nombreCharm) {
      return null;
    }

    // Logging detallado para primeros 3 charms
    if (index < 3) {
      console.log(`📝 Charm ${index + 1}: "${nombreCharm}"`);
      console.log(`  tags RAW: "${tagsStr}"`);
      console.log(`  foto: "${fotoReferencia}"`);
    }

    const tags = tagsStr
      ? tagsStr.split(';').map(t => t.trim().toUpperCase()).filter(t => t)
      : [];

    return {
      _id: `charm_${index + 1}`,
      name: nombreCharm,
      type: tipoCharm.toUpperCase(),
      tags: tags,
      price: parseInt(precioStr) || 20000,
      stock: parseInt(stockStr) || 0,
      color: colorCharm,
      image: fotoReferencia,
      active: true
    };
  }).filter(charm => charm !== null);
}

// API Endpoint para sincronizar desde Google Sheets
app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Sincronizando desde Google Sheets (CSV)...');

    const { headers, dataRows } = await getCharmsFromGoogleSheets();
    const charms = parseCharmsFromGoogleSheets(headers, dataRows);

    if (charms.length === 0) {
      return res.status(400).json({ error: 'No charms found in Google Sheets' });
    }

    // Limpiar y reinsertar
    await Product.deleteMany({});
    await Product.insertMany(charms);

    const allTags = [...new Set(charms.flatMap(c => c.tags))].sort();
    console.log(`✅ Sincronización completada: ${charms.length} productos`);
    console.log(`🏷️ Tags únicos (${allTags.length}):`, allTags.join(', '));

    res.json({
      success: true,
      message: `${charms.length} productos sincronizados`,
      tags: allTags,
      count: charms.length
    });
  } catch (err) {
    console.error('❌ Error en sincronización:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API Endpoint para productos
app.get('/api/products', async (req, res) => {
  try {
    const filter = { active: true };

    // Filtrar por tipo si se proporciona
    if (req.query.type) {
      filter.type = req.query.type.toUpperCase();
    }

    const products = await Product.find(filter).sort({ name: 1 });
    console.log('📦 Productos enviados:', products.length, 'Filtro:', filter);
    res.json(products);
  } catch (err) {
    console.error('❌ Error en /api/products:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Validar código de descuento
app.post('/api/validate-code', (req, res) => {
  try {
    const { codigo, total } = req.body;

    if (!codigo) {
      return res.status(400).json({ error: 'Código requerido' });
    }

    const validation = validateCode(codigo);

    if (!validation.valido) {
      return res.status(400).json({ error: validation.error });
    }

    // Si se proporciona el total, calcular el descuento
    if (total && typeof total === 'number') {
      const discount = calculateDiscount(total, validation.descuento_pct);
      return res.json({
        valido: true,
        codigo: validation.codigo,
        descuento_pct: validation.descuento_pct,
        descuento_monto: discount.descuento_monto,
        total_original: discount.subtotal,
        total_con_descuento: discount.total_con_descuento
      });
    }

    // Solo validar el código
    res.json({
      valido: true,
      codigo: validation.codigo,
      descuento_pct: validation.descuento_pct
    });
  } catch (err) {
    console.error('❌ Error en validación de código:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Aplicar descuento (para carrito final)
app.post('/api/apply-discount', (req, res) => {
  try {
    const { codigo, total } = req.body;

    if (!codigo || typeof total !== 'number') {
      return res.status(400).json({ error: 'Código y total requeridos' });
    }

    const result = applyCode(total, codigo);
    res.json(result);
  } catch (err) {
    console.error('❌ Error aplicando descuento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Obtener códigos activos (para mostrar en UI)
app.get('/api/active-codes', (req, res) => {
  try {
    const codes = getActiveCodes();
    res.json({
      success: true,
      codes: codes,
      count: codes.length
    });
  } catch (err) {
    console.error('❌ Error obteniendo códigos activos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/checkout - Crear pedido
app.post('/api/checkout', async (req, res) => {
  try {
    const orderData = req.body;

    // Validar datos
    if (!orderData.nombre_cliente || !orderData.email || !orderData.telefono ||
        !orderData.direccion || !orderData.resumen_pedido || !orderData.total) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios'
      });
    }

    // Guardar en Airtable
    const airtableResponse = await axios.post(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME}`,
      {
        records: [{
          fields: {
            fecha: new Date().toISOString().split('T')[0],
            nombre_cliente: orderData.nombre_cliente,
            email: orderData.email,
            telefono: orderData.telefono,
            direccion: orderData.direccion,
            resumen_pedido: orderData.resumen_pedido,
            total: orderData.total,
            estado: 'Confirmado'
          }
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Pedido guardado en Airtable:', airtableResponse.data.records[0].id);

    // Decrementar stock
    const { items = {} } = orderData;
    const { charms = [], cueros = [], cordones = [] } = items;

    for (const item of [...charms, ...cueros, ...cordones]) {
      if (item.id && item.cantidad) {
        await Product.updateOne(
          { _id: item.id },
          { $inc: { stock: -item.cantidad } }
        );
      }
    }

    res.json({
      success: true,
      message: 'Pedido confirmado',
      orderId: airtableResponse.data.records[0].id
    });

  } catch (error) {
    console.error('❌ Error en checkout:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// API Status
app.get('/', (req, res) => {
  res.json({
    status: '✅ Cuatro Pájaros Backend API running',
    version: '1.0.0',
    endpoints: {
      products: 'GET /api/products',
      sync: 'POST /api/sync',
      validateCode: 'POST /api/validate-code',
      applyDiscount: 'POST /api/apply-discount',
      activeCodes: 'GET /api/active-codes',
      checkout: 'POST /api/checkout',
      credentialsInfo: 'GET /api/credentials-info'
    }
  });
});

// Endpoint para verificar credenciales
app.get('/api/credentials-info', (req, res) => {
  try {
    const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;

    if (!b64) {
      return res.status(500).json({
        error: 'GOOGLE_SERVICE_ACCOUNT_B64 no está definido',
        status: '❌'
      });
    }

    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const creds = JSON.parse(decoded);

    res.json({
      status: '✅',
      message: 'Credenciales validadas correctamente',
      serviceAccountEmail: creds.client_email,
      projectId: creds.project_id,
      privateKeyId: creds.private_key_id,
      privateKeyLength: creds.private_key.length,
      privateKeyFormat: creds.private_key.substring(0, 30) + '...' + creds.private_key.substring(creds.private_key.length - 30),
      warning: 'Este endpoint es solo para DEBUG. Las credenciales están seguras.'
    });
  } catch (err) {
    console.error('❌ Error en /api/credentials-info:', err.message);
    res.status(500).json({
      error: err.message,
      status: '❌'
    });
  }
});

// Sincronización automática cada 5 minutos
async function autoSyncFromGoogleSheets() {
  try {
    console.log('\n🔄 [AUTO-SYNC] Obteniendo datos de Google Sheets...');

    const { headers, dataRows } = await getCharmsFromGoogleSheets();
    const charms = parseCharmsFromGoogleSheets(headers, dataRows);

    if (charms.length === 0) {
      console.log('⚠️ [AUTO-SYNC] No charms encontrados');
      return;
    }

    await Product.deleteMany({});
    await Product.insertMany(charms);

    const allTags = [...new Set(charms.flatMap(c => c.tags))].sort();
    console.log(`✅ [AUTO-SYNC] ${charms.length} productos sincronizados`);
    console.log(`🏷️ Tags: ${allTags.join(', ')}`);
  } catch (err) {
    console.error('❌ [AUTO-SYNC] Error:', err.message);
  }
}

setInterval(autoSyncFromGoogleSheets, 5 * 60 * 1000);
autoSyncFromGoogleSheets();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 http://localhost:' + PORT));
