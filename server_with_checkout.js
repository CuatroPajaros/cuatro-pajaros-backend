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
      image: fotoReferencia, // Usa directamente la URL de Cloudinary desde Google Sheets
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

    // DEBUG: Mostrar todos los campos recibidos
    console.log('\n🔍 CAMPOS RECIBIDOS DEL HTML:');
    console.log('  tamaño_journal:', orderData.tamaño_journal || 'UNDEFINED');
    console.log('  color_cuero:', orderData.color_cuero || 'UNDEFINED');
    console.log('  color_cordon:', orderData.color_cordon || 'UNDEFINED');
    console.log('  color_ojales:', orderData.color_ojales || 'UNDEFINED');
    console.log('  charms_detalles:', orderData.charms_detalles ? 'PRESENTE' : 'UNDEFINED');
    console.log('  libretas_detalles:', orderData.libretas_detalles ? 'PRESENTE' : 'UNDEFINED');
    console.log('  precio_libretas:', orderData.precio_libretas || 'UNDEFINED');
    console.log('  nombre_cliente:', orderData.nombre_cliente || 'UNDEFINED');
    console.log('\n');

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
            tamaño_journal: orderData.tamaño_journal || '',
            color_cuero: orderData.color_cuero || '',
            color_cordon: orderData.color_cordon || '',
            color_ojales: orderData.color_ojales || '',
            charms_detalles: JSON.stringify(orderData.charms_detalles || []),
            libretas_detalles: JSON.stringify(orderData.libretas_detalles || []),
            precio_libretas: orderData.precio_libretas || 0,
            pochette: orderData.pochette ? 'Sí' : 'No',
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

// ==================== PÁGINA DE DIAGNÓSTICO ====================
app.get('/diagnostico', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diagnóstico de TAGS - Cuatro Pájaros</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            padding: 30px;
        }
        .step {
            margin-bottom: 30px;
            border-left: 4px solid #667eea;
            padding-left: 20px;
        }
        .step-title {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
        }
        .status.pending { background: #fff3cd; color: #856404; }
        .status.loading { background: #e7f3ff; color: #004085; }
        .status.success { background: #d4edda; color: #155724; }
        .status.error { background: #f8d7da; color: #721c24; }
        .result-box {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            overflow-x: auto;
            max-height: 300px;
            overflow-y: auto;
        }
        .result-box.success {
            background: #d4edda;
            border-color: #c3e6cb;
        }
        .result-box.error {
            background: #f8d7da;
            border-color: #f5c6cb;
        }
        .checklist {
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .checklist-item {
            display: flex;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #dee2e6;
        }
        .checklist-item:last-child {
            border-bottom: none;
        }
        .check-icon {
            font-size: 20px;
            margin-right: 15px;
            width: 24px;
        }
        .check-icon.✓ { color: #28a745; }
        .check-icon.✗ { color: #dc3545; }
        .check-icon.? { color: #ffc107; }
        .check-text {
            flex: 1;
        }
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary {
            background: #667eea;
            color: white;
        }
        .btn-primary:hover {
            background: #5568d3;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .recommendation {
            margin-top: 20px;
            padding: 15px;
            background: #e7f3ff;
            border-left: 4px solid #0066cc;
            border-radius: 4px;
        }
        .recommendation-title {
            font-weight: bold;
            color: #004085;
            margin-bottom: 5px;
        }
        .recommendation-text {
            color: #0056b3;
            font-size: 13px;
            line-height: 1.6;
        }
        .tags-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }
        .tag {
            background: #667eea;
            color: white;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Diagnóstico de TAGS</h1>
            <p>Cuatro Pájaros - Verificación Automática de Pipeline</p>
        </div>

        <div class="content">
            <!-- PASO 1: SYNC -->
            <div class="step">
                <div class="step-title">
                    <span class="spinner" id="spinner1"></span>
                    PASO 1: Sincronizar desde Google Sheets
                    <span class="status loading" id="status1">EJECUTANDO...</span>
                </div>
                <div id="result1"></div>
            </div>

            <!-- PASO 2: BACKEND DATA -->
            <div class="step">
                <div class="step-title">
                    <span class="spinner" id="spinner2" style="display:none;"></span>
                    PASO 2: Verificar datos en Backend
                    <span class="status pending" id="status2">PENDIENTE</span>
                </div>
                <div id="result2"></div>
            </div>

            <!-- PASO 3: FRONTEND LOAD -->
            <div class="step">
                <div class="step-title">
                    <span class="spinner" id="spinner3" style="display:none;"></span>
                    PASO 3: Recargar página y verificar filtros
                    <span class="status pending" id="status3">PENDIENTE</span>
                </div>
                <div id="result3"></div>
            </div>

            <!-- RESUMEN -->
            <div class="checklist" id="checklist">
                <h3>📋 Resumen de Verificación</h3>
                <div class="checklist-item">
                    <div class="check-icon">?</div>
                    <div class="check-text">Google Sheets se sincroniza correctamente</div>
                </div>
                <div class="checklist-item">
                    <div class="check-icon">?</div>
                    <div class="check-text">Backend lee tags desde Google Sheets</div>
                </div>
                <div class="checklist-item">
                    <div class="check-icon">?</div>
                    <div class="check-text">Frontend carga charms con tags</div>
                </div>
                <div class="checklist-item">
                    <div class="check-icon">?</div>
                    <div class="check-text">Filtros dinámicos se generan correctamente</div>
                </div>
            </div>

            <!-- BOTONES -->
            <div class="button-group">
                <button class="btn-primary" onclick="location.reload()">🔄 Ejecutar Diagnóstico Nuevamente</button>
                <button class="btn-secondary" onclick="window.location.href='/'">← Volver al Configurador</button>
            </div>
        </div>
    </div>

    <script>
        const API_BASE_URL = '';
        const results = {
            sync: null,
            products: null,
            tagsFound: false,
            allOthers: true
        };

        async function runDiagnostics() {
            try {
                await step1_sync();
                await step2_backend();
                step3_recommendations();
                updateChecklist();
            } catch (err) {
                console.error('Error en diagnósticos:', err);
            }
        }

        async function step1_sync() {
            document.getElementById('spinner1').style.display = 'inline-block';
            document.getElementById('status1').textContent = 'EJECUTANDO...';

            try {
                const response = await fetch('/api/sync', { method: 'POST' });
                const data = await response.json();
                results.sync = data;

                let html = '';

                if (data.error) {
                    html = \`
                        <div class="result-box error">
                            <strong>❌ ERROR en /api/sync:</strong><br><br>
                            \${data.error}
                        </div>
                        <div class="recommendation">
                            <div class="recommendation-title">⚠️ Problema identificado:</div>
                            <div class="recommendation-text">
                                El backend no puede acceder a Google Sheets.<br><br>
                                <strong>Causas posibles:</strong><br>
                                1. El Google Sheet no está compartido con: <code>inventory-sync-final@cuatropajaros-sync.iam.gserviceaccount.com</code><br>
                                2. Las variables de entorno en Render no están configuradas<br>
                                3. El Google Sheet no tiene datos o tiene encabezados incorrectos<br><br>
                                <strong>Solución:</strong> Asegúrate de compartir el Google Sheet con el email del Service Account.
                            </div>
                        </div>
                    \`;
                    document.getElementById('status1').className = 'status error';
                    document.getElementById('status1').textContent = 'ERROR';
                } else {
                    const tagsCount = data.tags ? data.tags.length : 0;
                    const allOthers = data.tags && data.tags.length === 1 && data.tags[0] === 'OTROS';

                    results.tagsFound = tagsCount > 0 && !allOthers;
                    results.allOthers = allOthers;

                    html = \`
                        <div class="result-box success">
                            <strong>✅ Sincronización completada:</strong><br><br>
                            📦 Productos: <strong>\${data.count}</strong><br>
                            🏷️ Tags encontrados: <strong>\${tagsCount}</strong>
                        </div>
                    \`;

                    if (data.tags && data.tags.length > 0) {
                        html += \`
                            <div class="tags-list">
                                \${data.tags.map(tag => \`<span class="tag">\${tag}</span>\`).join('')}
                            </div>
                        \`;
                    }

                    if (allOthers) {
                        html += \`
                            <div class="recommendation">
                                <div class="recommendation-title">⚠️ Aviso - Tags no se leen correctamente:</div>
                                <div class="recommendation-text">
                                    El backend sincronizó pero todos los productos tienen tags: ["OTROS"]<br><br>
                                    <strong>Esto significa:</strong> Google Sheets tiene datos pero el backend NO PUEDE LEER la columna TAGS<br><br>
                                    <strong>Verificar en Google Sheets:</strong><br>
                                    1. ¿Existe una columna llamada exactamente: <code>TAGS</code> (en mayúsculas)?<br>
                                    2. ¿Tiene datos? (no está vacía)<br>
                                    3. ¿El nombre no tiene espacios extras antes/después?
                                </div>
                            </div>
                        \`;
                        document.getElementById('status1').className = 'status error';
                        document.getElementById('status1').textContent = 'ADVERTENCIA';
                    } else {
                        document.getElementById('status1').className = 'status success';
                        document.getElementById('status1').textContent = 'OK';
                    }
                }

                document.getElementById('result1').innerHTML = html;
                document.getElementById('spinner1').style.display = 'none';

            } catch (err) {
                document.getElementById('result1').innerHTML = \`
                    <div class="result-box error">
                        <strong>❌ ERROR de conexión:</strong><br><br>
                        \${err.message}
                    </div>
                \`;
                document.getElementById('status1').className = 'status error';
                document.getElementById('status1').textContent = 'ERROR';
                document.getElementById('spinner1').style.display = 'none';
            }
        }

        async function step2_backend() {
            document.getElementById('spinner2').style.display = 'inline-block';
            document.getElementById('status2').textContent = 'EJECUTANDO...';
            document.getElementById('status2').className = 'status loading';

            try {
                const response = await fetch('/api/products');
                const data = await response.json();
                results.products = data;

                let html = '';

                if (!Array.isArray(data) || data.length === 0) {
                    html = \`
                        <div class="result-box error">
                            <strong>⚠️ Sin productos en backend</strong><br><br>
                            El API retornó un array vacío. Posiblemente es porque /api/sync aún no se ejecutó correctamente.
                        </div>
                    \`;
                    document.getElementById('status2').className = 'status error';
                    document.getElementById('status2').textContent = 'SIN DATOS';
                } else {
                    const charmCount = data.length;
                    const charmsWithRealTags = data.filter(p => p.tags && Array.isArray(p.tags) && p.tags.length > 0 && !(p.tags.length === 1 && p.tags[0] === 'OTROS')).length;
                    const charmsWithOnlyOthers = data.filter(p => p.tags && Array.isArray(p.tags) && (p.tags.length === 0 || (p.tags.length === 1 && p.tags[0] === 'OTROS'))).length;

                    const firstCharm = data[0];

                    html = \`
                        <div class="result-box success">
                            <strong>✅ Datos del Backend:</strong><br><br>
                            📦 Total charms: <strong>\${charmCount}</strong><br>
                            ✅ Con tags válidos: <strong>\${charmsWithRealTags}</strong><br>
                            ❌ Con tags ["OTROS"]: <strong>\${charmsWithOnlyOthers}</strong>
                        </div>
                        <div style="margin-top: 15px;">
                            <strong>Ejemplo - Primer charm:</strong>
                            <div class="result-box">
                                Nombre: <strong>\${firstCharm.name}</strong><br>
                                Tags: <strong>\${JSON.stringify(firstCharm.tags)}</strong><br>
                                Stock: <strong>\${firstCharm.stock}</strong><br>
                                Precio: <strong>\${firstCharm.price}</strong>
                            </div>
                        </div>
                    \`;

                    if (charmsWithRealTags > 0) {
                        document.getElementById('status2').className = 'status success';
                        document.getElementById('status2').textContent = 'OK';
                    } else if (charmsWithOnlyOthers === charmCount) {
                        document.getElementById('status2').className = 'status error';
                        document.getElementById('status2').textContent = 'SOLO OTROS';
                        html += \`
                            <div class="recommendation">
                                <div class="recommendation-title">⚠️ PROBLEMA: Todos los charms tienen tags ["OTROS"]</div>
                                <div class="recommendation-text">
                                    El backend cargó los charms pero no puede leer los tags de Google Sheets.<br><br>
                                    <strong>Verifica en Google Sheets:</strong><br>
                                    1. ¿La columna se llama exactamente <code>TAGS</code> (mayúsculas)?<br>
                                    2. ¿Tiene datos como "BOTANICA; NATURALEZA"?<br>
                                    3. ¿El nombre no tiene espacios extras?<br><br>
                                    Después de verificar, ejecuta el diagnóstico nuevamente.
                                </div>
                            </div>
                        \`;
                    } else {
                        document.getElementById('status2').className = 'status success';
                        document.getElementById('status2').textContent = 'PARCIAL';
                    }
                }

                document.getElementById('result2').innerHTML = html;
                document.getElementById('spinner2').style.display = 'none';

            } catch (err) {
                document.getElementById('result2').innerHTML = \`
                    <div class="result-box error">
                        <strong>❌ ERROR:</strong><br><br>
                        \${err.message}
                    </div>
                \`;
                document.getElementById('status2').className = 'status error';
                document.getElementById('status2').textContent = 'ERROR';
                document.getElementById('spinner2').style.display = 'none';
            }
        }

        function step3_recommendations() {
            document.getElementById('spinner3').style.display = 'none';

            let html = '';

            if (!results.sync) {
                html = \`
                    <div class="recommendation">
                        <div class="recommendation-title">⚠️ No se pudo completar PASO 1</div>
                        <div class="recommendation-text">El PASO 1 (sincronización) falló. Revisa el error arriba antes de continuar.</div>
                    </div>
                \`;
                document.getElementById('status3').className = 'status error';
                document.getElementById('status3').textContent = 'BLOQUEADO';
            } else if (results.allOthers) {
                html = \`
                    <div class="recommendation">
                        <div class="recommendation-title">⚠️ Tags no se leen correctamente</div>
                        <div class="recommendation-text">
                            Aunque la sincronización completó, el backend NO puede leer la columna TAGS de Google Sheets.<br><br>
                            <strong>Acción necesaria:</strong><br>
                            1. Abre tu Google Sheet<br>
                            2. Verifica que existe la columna <code>TAGS</code> (exactamente así, en mayúsculas)<br>
                            3. Verifica que tiene datos (ej: "BOTANICA; NATURALEZA")<br>
                            4. No tiene espacios extras antes/después del nombre<br><br>
                            Después de verificar, <strong>recarga esta página</strong> para ejecutar el diagnóstico nuevamente.
                        </div>
                    </div>
                \`;
                document.getElementById('status3').className = 'status error';
                document.getElementById('status3').textContent = 'REVISAR';
            } else if (results.tagsFound) {
                html = \`
                    <div class="recommendation">
                        <div class="recommendation-title">✅ Tags se leen correctamente</div>
                        <div class="recommendation-text">
                            El backend está leyendo los tags de Google Sheets correctamente.<br><br>
                            <strong>Próximo paso:</strong><br>
                            1. Recarga la página del configurador<br>
                            2. Usa <strong>Ctrl+Shift+R</strong> (Windows/Linux) o <strong>Cmd+Shift+R</strong> (Mac) para limpiar cache<br>
                            3. Los botones de filtro deberían aparecer: ANIMALES, BOTANICA, CORAZONES, etc.<br><br>
                            <strong>Si los filtros siguen sin aparecer:</strong><br>
                            Contacta con soporte y proporciona esta información.
                        </div>
                    </div>
                    <div class="button-group">
                        <button class="btn-primary" onclick="window.location.href='/'">→ Ir al Configurador</button>
                    </div>
                \`;
                document.getElementById('status3').className = 'status success';
                document.getElementById('status3').textContent = 'OK';
            } else {
                html = \`
                    <div class="recommendation">
                        <div class="recommendation-title">⏳ Estado desconocido</div>
                        <div class="recommendation-text">No se pudo determinar el estado. Revisa los PASOS 1 y 2 arriba.</div>
                    </div>
                \`;
                document.getElementById('status3').className = 'status pending';
                document.getElementById('status3').textContent = 'REVISAR';
            }

            document.getElementById('result3').innerHTML = html;
        }

        function updateChecklist() {
            const checks = document.querySelectorAll('.checklist-item');

            if (results.sync && !results.sync.error) {
                checks[0].querySelector('.check-icon').textContent = '✓';
                checks[0].querySelector('.check-icon').className = 'check-icon ✓';
            } else {
                checks[0].querySelector('.check-icon').textContent = '✗';
                checks[0].querySelector('.check-icon').className = 'check-icon ✗';
            }

            if (results.sync && !results.sync.error && !results.allOthers) {
                checks[1].querySelector('.check-icon').textContent = '✓';
                checks[1].querySelector('.check-icon').className = 'check-icon ✓';
            } else {
                checks[1].querySelector('.check-icon').textContent = '✗';
                checks[1].querySelector('.check-icon').className = 'check-icon ✗';
            }

            if (results.products && Array.isArray(results.products) && results.products.length > 0) {
                checks[2].querySelector('.check-icon').textContent = '✓';
                checks[2].querySelector('.check-icon').className = 'check-icon ✓';
            } else {
                checks[2].querySelector('.check-icon').textContent = '✗';
                checks[2].querySelector('.check-icon').className = 'check-icon ✗';
            }

            if (results.tagsFound && results.products && results.products.length > 0) {
                checks[3].querySelector('.check-icon').textContent = '✓';
                checks[3].querySelector('.check-icon').className = 'check-icon ✓';
            } else {
                checks[3].querySelector('.check-icon').textContent = '✗';
                checks[3].querySelector('.check-icon').className = 'check-icon ✗';
            }
        }

        window.addEventListener('load', runDiagnostics);
    </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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
