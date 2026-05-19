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

// Autenticar con Google Sheets API usando Service Account
async function getAuthenticatedSheetsClient() {
  try {
    console.log('🔐 Decodificando Service Account desde base64...');
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    console.log('✅ Base64 decodificado exitosamente');

    const serviceAccountJSON = JSON.parse(decoded);
    console.log('✅ JSON parseado exitosamente, email:', serviceAccountJSON.client_email);

    // Procesar la private_key para asegurar que tiene newlines reales
    let privateKey = serviceAccountJSON.private_key;

    // Si la clave contiene secuencias de escape literal \\n, reemplazarlas
    if (privateKey.includes('\\n')) {
      console.log('⚠️  Detectadas secuencias de escape \\n en la clave privada, reemplazando...');
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    console.log(`📝 Longitud de private_key: ${privateKey.length} caracteres`);
    console.log(`📝 Comienza con: ${privateKey.substring(0, 30)}...`);
    console.log(`📝 Termina con: ...${privateKey.substring(privateKey.length - 30)}`);

    const { JWT } = require('google-auth-library');
    const auth = new JWT({
      email: serviceAccountJSON.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    // Autorizar explícitamente
    console.log('🔐 Creando token JWT...');
    await auth.authorize();
    console.log('✅ JWT creado y autorizado exitosamente');

    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error('❌ Error en getAuthenticatedSheetsClient:', err.message);
    console.error('❌ Stack:', err.stack);
    throw err;
  }
}

// Función para obtener datos desde Google Sheets (CSV público - sin autenticación)
async function getCharmsFromGoogleSheets() {
  try {
    console.log('📥 Descargando Google Sheet como CSV (sin autenticación)...');

    const spreadsheetId = '1Ed2d6dqnyc700gsF6oW-ZJP3hx32qNV31TSwszGEi3k';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=866448467`;

    console.log(`🔗 URL CSV: ${csvUrl}`);

    const response = await axios.get(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
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

// API Endpoint para sincronizar desde Google Sheets (AUTENTICADO)
app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Sincronizando desde Google Sheets (API autenticada)...');

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

// ==================== ENDPOINTS DE CÓDIGOS DE DESCUENTO ====================

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

// ========================================
// POST /api/checkout - Crear pedido
// ========================================
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

    // Log de configuración
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableId = process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME;
    const apiKey = process.env.AIRTABLE_API_KEY;

    console.log('📝 Intentando crear pedido en Airtable...');
    console.log('   Base ID:', baseId ? baseId.substring(0, 5) + '***' : 'NO CONFIGURADO');
    console.log('   Table ID:', tableId ? tableId.substring(0, 5) + '***' : 'NO CONFIGURADO');
    console.log('   API Key:', apiKey ? apiKey.substring(0, 5) + '***' : 'NO CONFIGURADO');

    // Validar que están configuradas las credenciales
    if (!baseId || !tableId || !apiKey) {
      console.error('❌ Credenciales de Airtable incompletas');
      return res.status(500).json({
        success: false,
        message: 'Credenciales de Airtable no configuradas en el servidor'
      });
    }

    // Construir URL del endpoint
    const airtableUrl = `https://api.airtable.com/v0/${baseId}/${tableId}`;
    console.log('🔗 URL Airtable:', airtableUrl);

    // Guardar en Airtable
    const airtableResponse = await axios.post(
      airtableUrl,
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
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Pedido guardado en Airtable:', airtableResponse.data.records[0].id);

    // Decrementar stock
    const items = orderData.items || [];

    for (const item of items) {
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

    // Log detallado de errores de Airtable
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error Airtable:', JSON.stringify(error.response.data, null, 2));
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.error?.message || error.message,
      details: error.response?.data
    });
  }
});

// ==================== ENDPOINT PARA DIAGNÓSTICO DE AIRTABLE ====================
app.get('/api/airtable-check', (req, res) => {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableId = process.env.AIRTABLE_TABLE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;
    const apiKey = process.env.AIRTABLE_API_KEY;

    res.json({
      status: 'Diagnóstico de configuración de Airtable',
      configured: {
        base_id: baseId ? '✅ Configurado' : '❌ NO CONFIGURADO',
        table_id: tableId ? '✅ Configurado' : '❌ NO CONFIGURADO',
        table_name: tableName ? '✅ Configurado' : '❌ NO CONFIGURADO',
        api_key: apiKey ? '✅ Configurado' : '❌ NO CONFIGURADO'
      },
      values: {
        base_id: baseId || 'NO CONFIGURADO',
        table_id: tableId || 'NO CONFIGURADO',
        table_name: tableName || 'NO CONFIGURADO',
        api_key: apiKey ? apiKey.substring(0, 10) + '***' : 'NO CONFIGURADO'
      },
      note: 'La tabla usará TABLE_ID si está disponible, sino TABLE_NAME',
      endpoint_test: `POST https://api.airtable.com/v0/${baseId || 'BASE_ID'}/${tableId || tableName || 'TABLE_ID'}`
    });
  } catch (err) {
    console.error('❌ Error en airtable-check:', err.message);
    res.status(500).json({ error: err.message });
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
      airtableCheck: 'GET /api/airtable-check',
      credentialsInfo: 'GET /api/credentials-info'
    }
  });
});

// ==================== ENDPOINT PARA VERIFICAR CREDENCIALES ====================
app.get('/api/credentials-info', (req, res) => {
  try {
    const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;

    if (!b64) {
      return res.status(500).json({
        error: 'GOOGLE_SERVICE_ACCOUNT_B64 no está definido en variables de entorno',
        status: '❌'
      });
    }

    // Decodificar y parsear
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
      warning: 'Este endpoint es solo para DEBUG. Las credenciales están seguras (no expone la clave privada completa).'
    });
  } catch (err) {
    console.error('❌ Error en /api/credentials-info:', err.message);
    res.status(500).json({
      error: err.message,
      status: '❌'
    });
  }
});

// ==================== SINCRONIZACIÓN AUTOMÁTICA ====================
async function autoSyncFromGoogleSheets() {
  try {
    console.log('\n🔄 [AUTO-SYNC] Obteniendo datos de Google Sheets API...');

    const { headers, dataRows } = await getCharmsFromGoogleSheets();
    const charms = parseCharmsFromGoogleSheets(headers, dataRows);

    if (charms.length === 0) {
      console.log('⚠️ [AUTO-SYNC] No charms encontrados en Google Sheets');
      return;
    }

    await Product.deleteMany({});
    await Product.insertMany(charms);

    const allTags = [...new Set(charms.flatMap(c => c.tags))].sort();
    console.log(`✅ [AUTO-SYNC] ${charms.length} productos sincronizados`);
    console.log(`🏷️  Tags: ${allTags.join(', ')}`);
  } catch (err) {
    console.error('❌ [AUTO-SYNC] Error:', err.message);
  }
}

// Sincronizar automáticamente cada 5 minutos
setInterval(autoSyncFromGoogleSheets, 5 * 60 * 1000);

// Hacer la primera sincronización al iniciar
autoSyncFromGoogleSheets();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 http://localhost:' + PORT));
