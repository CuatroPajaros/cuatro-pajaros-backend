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

// Servir HTML para subir imágenes de charms
const backendPath = path.resolve(__dirname);
app.use(express.static(backendPath));

// Rutas explícitas para archivos HTML
app.get('/upload-charm-images.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload-charm-images.html'));
});

app.get('/admin-charm-images.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-charm-images.html'));
});

app.get('/load-charms.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'load-charms.html'));
});

console.log('📁 Rutas de imágenes configuradas:');
console.log('  /CHARMS ->', path.join(fotosPath, 'CHARMS'));
console.log('  /CORDONES ->', path.join(fotosPath, 'CORDONES'));
console.log('  /CUERO ->', path.join(fotosPath, 'CUERO'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB conectado');
    // Cargar cache de imágenes al conectarse
    await loadCharmImagesCache();
  })
  .catch(err => console.error('❌ MongoDB:', err.message));

// Sistema de descuentos desde local
console.log('🎁 Sistema de códigos de descuento activado (local)');

// Cache de imágenes en memoria
let charmImagesCache = {};

async function loadCharmImagesCache() {
  try {
    const images = await CharmImage.find({});
    images.forEach(img => {
      charmImagesCache[img.nombre_charm] = img.cloudinary_url;
    });
    console.log(`📸 Cache de ${Object.keys(charmImagesCache).length} imágenes cargado en memoria`);
  } catch (err) {
    console.error('❌ Error cargando cache de imágenes:', err.message);
  }
}

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

// Schema para imágenes de charms
const charmImageSchema = new mongoose.Schema({
  _id: String, // charm_id o unique name
  cloudinary_url: String,
  nombre_charm: String
});

const CharmImage = mongoose.model('CharmImage', charmImageSchema);

// Autenticar con Google Sheets API usando Service Account
async function getAuthenticatedSheetsClient() {
  try {
    console.log('🔐 Decodificando Service Account desde base64...');
    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    console.log('✅ Base64 decodificado exitosamente');

    const serviceAccountJSON = JSON.parse(decoded);
    console.log('✅ JSON parseado exitosamente, email:', serviceAccountJSON.client_email);

    const { JWT } = require('google-auth-library');
    const auth = new JWT({
      email: serviceAccountJSON.client_email,
      key: serviceAccountJSON.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    // Get access token to validate credentials early
    const token = await auth.getAccessToken();
    console.log('✅ JWT token obtenido exitosamente');

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

// API Endpoint para guardar imagen individual de un charm
app.post('/api/save-charm-image', async (req, res) => {
  try {
    const { charm_name, cloudinary_url } = req.body;

    if (!charm_name || !cloudinary_url) {
      return res.status(400).json({ error: 'charm_name y cloudinary_url requeridos' });
    }

    // Guardar o actualizar en CharmImage
    await CharmImage.findByIdAndUpdate(
      charm_name,
      {
        _id: charm_name,
        nombre_charm: charm_name,
        cloudinary_url: cloudinary_url
      },
      { upsert: true, new: true }
    );

    // Recargar cache en memoria
    charmImagesCache[charm_name] = cloudinary_url;

    console.log(`✅ Imagen guardada para ${charm_name}`);
    res.json({
      success: true,
      message: `Imagen guardada para ${charm_name}`,
      charm_name: charm_name,
      cloudinary_url: cloudinary_url
    });
  } catch (err) {
    console.error('❌ Error en /api/save-charm-image:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API Endpoint para sincronizar charms + imágenes desde CSV
app.post('/api/sync-charms-from-csv', express.text(), async (req, res) => {
  try {
    console.log('📤 Sincronizando charms e imágenes desde CSV...');

    const csvText = req.body;
    const records = csv.parse(csvText, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`📊 CSV parseado: ${records.length} registros encontrados`);

    let charmCount = 0;
    let imageCount = 0;
    const charmImages = [];
    const charmsToInsert = [];

    for (const record of records) {
      const nombreCharm = record['Nombre_Charm']?.trim();
      const nombreUnico = record['Nombre Único (Display Name)']?.trim();
      const cloudinaryUrl = record['Clour ordinary URL']?.trim();

      if (nombreCharm && cloudinaryUrl) {
        // Preparar charm para insertar en Product
        charmsToInsert.push({
          _id: `charm_${charmCount + 1}`,
          name: nombreCharm,
          type: 'CHARM',
          price: 15000, // precio default
          stock: 10, // stock default
          color: '',
          image: cloudinaryUrl,
          tags: [],
          active: true
        });

        // Preparar imagen para CharmImage
        charmImages.push({
          _id: nombreCharm,
          nombre_charm: nombreCharm,
          cloudinary_url: cloudinaryUrl
        });

        charmCount++;
        imageCount++;
      }
    }

    if (charmsToInsert.length === 0) {
      return res.status(400).json({ error: 'No charms found in CSV' });
    }

    // Insertar charms en Product
    await Product.deleteMany({ type: 'CHARM' });
    await Product.insertMany(charmsToInsert);

    // Insertar imágenes en CharmImage
    await CharmImage.deleteMany({});
    await CharmImage.insertMany(charmImages);

    // Recargar cache
    await loadCharmImagesCache();

    console.log(`✅ ${charmCount} charms + ${imageCount} imágenes sincronizados`);
    res.json({
      success: true,
      message: `${charmCount} charms y ${imageCount} imágenes sincronizados correctamente`,
      charms: charmCount,
      images: imageCount
    });
  } catch (err) {
    console.error('❌ Error en /api/sync-charms-from-csv:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API Endpoint para subir/procesar CSV de imágenes de charms (legado)
app.post('/api/upload-charm-images', express.text(), async (req, res) => {
  try {
    console.log('📤 Procesando CSV de imágenes de charms...');

    // Parsear CSV desde el body (texto plano)
    const csvText = req.body;
    const records = csv.parse(csvText, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`📊 CSV parseado: ${records.length} registros encontrados`);

    let processedCount = 0;
    const charmImages = [];

    for (const record of records) {
      const nombreUnico = record['Nombre Único (Display Name)']?.trim();
      const cloudinaryUrl = record['Clour ordinary URL']?.trim();
      const nombreCharm = record['Nombre_Charm']?.trim();

      if (nombreUnico && cloudinaryUrl) {
        charmImages.push({
          _id: nombreUnico,
          cloudinary_url: cloudinaryUrl,
          nombre_charm: nombreCharm || nombreUnico
        });
        processedCount++;
      }
    }

    if (charmImages.length === 0) {
      return res.status(400).json({ error: 'No charm images found in CSV' });
    }

    // Limpiar y reinsertar en CharmImage
    await CharmImage.deleteMany({});
    await CharmImage.insertMany(charmImages);

    // Recargar el cache en memoria
    await loadCharmImagesCache();

    console.log(`✅ ${processedCount} imágenes de charms guardadas en MongoDB`);
    res.json({
      success: true,
      message: `${processedCount} charm images procesadas`,
      count: processedCount
    });
  } catch (err) {
    console.error('❌ Error en /api/upload-charm-images:', err.message);
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

    // Asignar imágenes desde cache en memoria
    const enrichedProducts = products.map((product) => {
      const productObj = product.toObject();

      if (productObj.type === 'CHARM' && charmImagesCache[productObj.name]) {
        productObj.image = charmImagesCache[productObj.name];
      }

      return productObj;
    });

    console.log('📦 Productos enviados:', enrichedProducts.length, 'Filtro:', filter);
    res.json(enrichedProducts);
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
      uploadCharmImages: 'POST /api/upload-charm-images',
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
