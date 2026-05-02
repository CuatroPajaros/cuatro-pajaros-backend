// Modelo y funciones para códigos de descuento
// Este archivo gestiona validación y aplicación de códigos

const discountCodes = {
  'bienvenida': {
    codigo: 'bienvenida',
    descuento_pct: 15,           // 15% de descuento
    un_solo_uso: false,          // Puede usarse múltiples veces
    activo: true,
    fecha_inicio: '2025-01-01',
    fecha_fin: '2026-12-31',
    max_usos: null               // Sin límite de usos
  },
  'primeracompra': {
    codigo: 'primeracompra',
    descuento_pct: 20,           // 20% para primera compra
    un_solo_uso: true,           // Un solo uso por cliente
    activo: true,
    fecha_inicio: '2025-01-01',
    fecha_fin: '2026-12-31',
    max_usos: null
  },
  'navidad2025': {
    codigo: 'navidad2025',
    descuento_pct: 25,           // 25% descuento navideño
    un_solo_uso: false,
    activo: true,
    fecha_inicio: '2025-11-01',
    fecha_fin: '2025-12-31',
    max_usos: 100
  }
};

/**
 * Valida un código de descuento
 * @param {string} codigo - El código a validar
 * @returns {object} { valido: boolean, error: string, descuento_pct: number }
 */
function validateCode(codigo) {
  if (!codigo || typeof codigo !== 'string') {
    return { valido: false, error: 'Código no válido' };
  }

  const code = codigo.toLowerCase().trim();
  const discountCode = discountCodes[code];

  if (!discountCode) {
    return { valido: false, error: 'Código de descuento no encontrado' };
  }

  if (!discountCode.activo) {
    return { valido: false, error: 'Código de descuento inactivo' };
  }

  // Validar fechas
  const hoy = new Date().toISOString().split('T')[0];
  if (discountCode.fecha_inicio && hoy < discountCode.fecha_inicio) {
    return { valido: false, error: 'Este código aún no está disponible' };
  }

  if (discountCode.fecha_fin && hoy > discountCode.fecha_fin) {
    return { valido: false, error: 'Este código ha expirado' };
  }

  return {
    valido: true,
    error: null,
    descuento_pct: discountCode.descuento_pct,
    un_solo_uso: discountCode.un_solo_uso,
    codigo: code
  };
}

/**
 * Calcula el descuento sobre un total
 * @param {number} total - Total antes del descuento
 * @param {number} descuento_pct - Porcentaje de descuento
 * @returns {object} { descuento_monto: number, total_con_descuento: number }
 */
function calculateDiscount(total, descuento_pct) {
  const descuento_monto = Math.round(total * (descuento_pct / 100));
  const total_con_descuento = total - descuento_monto;

  return {
    subtotal: total,
    descuento_pct: descuento_pct,
    descuento_monto: descuento_monto,
    total_con_descuento: total_con_descuento
  };
}

/**
 * Aplica código al carrito (para usar en endpoint)
 * @param {number} cartTotal - Total del carrito en COP
 * @param {string} codigo - Código a aplicar
 * @returns {object} Resultado con detalles del descuento
 */
function applyCode(cartTotal, codigo) {
  const validation = validateCode(codigo);

  if (!validation.valido) {
    return {
      exito: false,
      error: validation.error,
      total: cartTotal
    };
  }

  const discount = calculateDiscount(cartTotal, validation.descuento_pct);

  return {
    exito: true,
    error: null,
    codigo: validation.codigo,
    descuento_pct: validation.descuento_pct,
    descuento_monto: discount.descuento_monto,
    subtotal: discount.subtotal,
    total: discount.total_con_descuento
  };
}

/**
 * Obtiene la lista de códigos activos (para mostrar al usuario)
 * @returns {array} Array de códigos con detalles públicos
 */
function getActiveCodes() {
  const hoy = new Date().toISOString().split('T')[0];

  return Object.values(discountCodes)
    .filter(code => code.activo && hoy >= code.fecha_inicio && hoy <= code.fecha_fin)
    .map(code => ({
      codigo: code.codigo,
      descuento_pct: code.descuento_pct,
      descripcion: `${code.descuento_pct}% de descuento`
    }));
}

module.exports = {
  discountCodes,
  validateCode,
  calculateDiscount,
  applyCode,
  getActiveCodes
};
