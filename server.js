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
  // Usar csv-parse para manejar correctamente CSV con comillas y comillas escapadas
  const records = csv.parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return records.map((row, index) => {
    const tags = row.TAGS
      ? row.TAGS.split(';').map(t => t.trim().toUpperCase())
      : [];

    return {
      _id: `charm_${index + 1}`,
      name: row.Nombre_Charm || '',
      type: (row.TIPO || '').toUpperCase(),
      tags: tags,
      price: parseInt(row.Precio_Venta_COP) || 20000,
      stock: parseInt(row.Stock_Disponible) || 0,
      color: row.Color || '',
      image: row.Foto_Referencia || '',
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
      filter.type = req.query.type
