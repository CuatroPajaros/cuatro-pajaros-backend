require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const csv = require('csv-parse/sync');

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

// Función para descargar CSV desde Google Sheets publicado
function downloadCSV() {
  return new Promise((resolve, reject) => {
    const url = 'https://docs.google.com/spreadsheets/d/1Ed2d6dqnyc700gsF6oW-ZJP3hx32qNV31TSwszGEi3k/export?format=csv&gid=866448467';

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Función para parsear datos del CSV
function parseCharmsFromCSV(csvData) {
  const records = csv.parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return records.map((row, index) => {
    const tags = row.TAGS
      ? row.TAGS.split(';').map(t => t.trim().toUpperCase())
      : [];

    // Construir URL de Cloudinary automáticamente basándose en el nombre del charm
    let imageUrl = '';
    if (row.Nombre_Charm) {
      // Reemplazar espacios y caracteres especiales con guiones bajos
      const charmNameForURL = row.Nombre_Charm
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '');
      imageUrl = `https://res.cloudinary.com/dlrocl9fr/image/upload/${charmNameForURL}.jpg`;
    }

    return {
      _id: `charm_${index + 1}`,
      name: row.Nombre_Charm || '',
      type: (row.TIPO || '').toUpperCase(),
      tags: tags,
      price: parseInt(row.Precio_Venta_COP) || 20000,
      stock: parseInt(row.Stock_Disponible) || 0,
      color: row.Color || '',
      image: imageUrl,
      active: true
    };
  }).filter(charm => charm.name);
}

// API Endpoint para sincronizar desde Google Sheets
app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Sincronizando desde Google Sheets...');

    const csvData = await downloadCSV();
    const charms = parseCharmsFromCSV(csvData);

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

// Aplicar descuento
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

// Obtener códigos activos
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

// Sincronización automática
async function autoSyncFromGoogleSheets() {
  try {
    console.log('\n🔄 [AUTO-SYNC] Descargando datos de Google Sheets...');

    const csvData = await downloadCSV();
    const charms = parseCharmsFromCSV(csvData);

    await Product.deleteMany({});
    await Product.insertMany(charms);

    const allTags = [...new Set(charms.flatMap(c => c.tags))].sort();
    console.log(`✅ [AUTO-SYNC] ${charms.length} productos sincronizados`);
    console.log(`🏷️  Tags: ${allTags.join(', ')}`);
  } catch (err) {
    console.error('❌ [AUTO-SYNC] Error:', err.message);
  }
}

setInterval(autoSyncFromGoogleSheets, 5 * 60 * 1000);
autoSyncFromGoogleSheets();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 http://localhost:' + PORT));
