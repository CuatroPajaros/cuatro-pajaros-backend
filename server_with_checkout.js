require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parse/sync');
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

// ================== CSV PUBLIC EXPORT - SIN AUTENTICACIÓN ==================
async function getCharmsFromGoogleSheets() {
  try {
    console.log('📥 Descargando Google Sheet como CSV público...');
    const spreadsheetId = '1Ed2d6dqnyc700gsF6oW-ZJP3hx32qNV31TSwszGEi3k';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=866448467`;
    console.log(`🔗 URL CSV: ${csvUrl}`);

    const response = await axios.get(csvUrl);
    const csvData = response.data;

    const rows = csv.parse(csvData, {
      columns: false,
      skip_empty_lines: true
    });

    if (rows.length === 0) {
      throw new Error('No data found in Google Sheets CSV');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    console.log(`✅ CSV descargado: ${dataRows.length} filas`);
    console.log(`📋 Headers: ${headers.join(', ')}`);

    return { headers, dataRows };
  } catch (err) {
    console.error('❌ Error descargando CSV:', err.message);
    throw err;
  }
}

function parseCharmsFromGoogleSheets(headers, dataRows) {
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header.trim()] = index;
  });

  return dataRows.map((row, index) => {
    const nombreCharm = row[headerMap['Nombre_Charm']] || '';
    const tagsStr = row[headerMap['TAGS']] || '';
    const stockStr = row[headerMap['Stock_Disponible']] || '0';
    const colorCharm = row[headerMap['Color']] || '';
    const tipoCharm = row[headerMap['TIPO']] || '';
    const precioStr = row[headerMap['Precio_Venta_COP']] || '20000';
    const fotoReferencia = row[headerMap['Foto_Referencia']] || '';

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
      image: fotoReferencia,
      active: true
    };
  }).filter(charm => charm !== null);
}

// API SYNC
app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Sincronizando desde Google Sheets...');
    const { headers, dataRows } = await getCharmsFromGoogleSheets();
    const charms = parseCharmsFromGoogleSheets(headers, dataRows);

    if (charms.length === 0) {
      return res.status(400).json({ error: 'No charms found in Google Sheets' });
    }

    await Product.deleteMany({});
    await Product.insertMany(charms);

    const allTags = [...new Set(charms.flatMap(c => c.tags))].sort();
    console.log(`✅ ${charms.length} productos sincronizados`);
    console.log(`🏷️ Tags: ${allTags.join(', ')}`);

    res.json({
      success: true,
      message: `${charms.length} productos sincronizados`,
      tags: allTags,
      count: charms.length
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.type) {
      filter.type = req.query.type.toUpperCase();
    }
    const products = await Product.find(filter).sort({ name: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VALIDATE CODE
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
    res.status(500).json({ error: err.message });
  }
});

// APPLY DISCOUNT
app.post('/api/apply-discount', (req, res) => {
  try {
    const { codigo, total } = req.body;
    if (!codigo || typeof total !== 'number') {
      return res.status(400).json({ error: 'Código y total requeridos' });
    }
    const result = applyCode(total, codigo);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ACTIVE CODES
app.get('/api/active-codes', (req, res) => {
  try {
    const codes = getActiveCodes();
    res.json({
      success: true,
      codes: codes,
      count: codes.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CHECKOUT
app.post('/api/checkout', async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData.nombre_cliente || !orderData.email || !orderData.telefono ||
        !orderData.direccion || !orderData.resumen_pedido || !orderData.total) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios'
      });
    }

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
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// STATUS
app.get('/', (req, res) => {
  res.json({
    status: '✅ API running (CLEAN - CSV ONLY)',
    version: '2.0.0',
    endpoints: {
      products: 'GET /api/products',
      sync: 'POST /api/sync',
      validateCode: 'POST /api/validate-code',
      applyDiscount: 'POST /api/apply-discount',
      activeCodes: 'GET /api/active-codes',
      checkout: 'POST /api/checkout'
    }
  });
});

async function autoSyncFromGoogleSheets() {
  try {
    console.log('\n🔄 [AUTO-SYNC] Sincronizando...');
    const { headers, dataRows } = await getCharmsFromGoogleSheets();
    const charms = parseCharmsFromGoogleSheets(headers, dataRows);

    if (charms.length === 0) {
      console.log('⚠️ No charms encontrados');
      return;
    }

    await Product.deleteMany({});
    await Product.insertMany(charms);
    const allTags = [...new Set(charms.flatMap(c => c.tags))].sort();
    console.log(`✅ ${charms.length} productos sincronizados`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

setInterval(autoSyncFromGoogleSheets, 5 * 60 * 1000);
autoSyncFromGoogleSheets();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 http://localhost:' + PORT));
