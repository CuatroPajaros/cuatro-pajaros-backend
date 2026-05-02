require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const csv = require('csv-parse/sync');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

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
    // Decodificar el JSON del Service Account desde base64
    console.log('🔐 Decodificando Service Account desde base64...');
    ...
    console.log('✅ GoogleAuth creado exitosamente');
    return google.sheets({ version: 'v4', auth });
  } catch (err) {
    console.error('❌ Error en getAuthenticatedSheetsClient:', err.message);
    throw err;
  }
}
// Función para obtener datos desde Google Sheets (autenticado)
async function getCharmsFromGoogleSheets() {
  try {
    console.log('🔐 Autenticando con Google Sheets API...');

    const sheets = await getAuthenticatedSheetsClient();
    const spreadsheetId = '1Ed2d6dqnyc700gsF6oW-ZJP3hx32qNV31TSwszGEi3k';
    const range = 'INVENTARIO!A1:H1000'; // Rango que incluye header y datos

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      throw new Error('No data found in Google Sheets');
    }

    // Primera fila son headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    console.log(`✅ Google Sheets API: ${dataRows.length} filas obtenidas`);

    return { headers, dataRows };
  } catch (err) {
    console.error('❌ Error obteniendo datos de Google Sheets:', err.message);
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
      activeCodes: 'GET /api/active-codes'
    }
  });
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
