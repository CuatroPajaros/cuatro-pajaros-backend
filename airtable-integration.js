// Configuración de Airtable
const AIRTABLE_CONFIG = {
  baseId: 'appHc3E8X4q0kdps0',
  tableId: 'tblLfvkCVikoR3vt1',
  apiKey: 'patmRW5Nz1yJTEOmfBE6ozW5jl1UllSsbuQuchUjYAGsWTf9m3rwhWvcMOpLaSS3GkGaXEpPnNCiJRF6cD1rjrtHtykO1au1KNToLONd99ZJSRnyEXlM',
  llaveBancolombia: 'CUATROPAJAROS@ICLOUD.COM'
};

let pedidoActualRecordId = null;

/**
 * Función principal: Crear pedido en Airtable
 */
async function crearPedidoEnAirtable() {
  try {
    if (!S.charms || Object.keys(S.charms).length === 0) {
      showError('El carrito está vacío');
      return;
    }

    const pedido = recolectarDatosPedido();

    if (!pedido) {
      showError('Por favor completa todos los campos requeridos');
      return;
    }

    const record = {
      fields: {
        'nombre_cliente': pedido.nombre,
        'email': pedido.email,
        'telefono': pedido.telefono,
        'direccion': pedido.direccion,
        'Localidad': pedido.localidad,
        'notas_adicionales': pedido.notas || '',
        'charms_detalles': pedido.accesorios,
        'total': pedido.monto,
        'estado': 'Pedido Solicitado',
        'fecha': new Date().toISOString()
      }
    };

    const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${AIRTABLE_CONFIG.tableId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error Airtable:', error);
      showError('Error al crear el pedido: ' + (error.error?.message || 'Error desconocido'));
      return;
    }

    const result = await response.json();
    pedidoActualRecordId = result.id;
    mostrarModalPago(pedido);

  } catch (error) {
    console.error('Error:', error);
    showError('Error al procesar el pedido: ' + error.message);
  }
}

function recolectarDatosPedido() {
  try {
    const nombre = document.getElementById('form_nombre')?.value?.trim();
    const email = document.getElementById('form_email')?.value?.trim();
    const telefono = document.getElementById('form_telefono')?.value?.trim();
    const direccion = document.getElementById('form_direccion')?.value?.trim();
    const localidad = document.getElementById('form_localidad')?.value?.trim();
    const notas = document.getElementById('form_notas')?.value?.trim();

    if (!nombre || !email || !telefono || !direccion || !localidad) {
      return null;
    }

    let accesorios = [];
    if (S.charms) {
      for (const [charmId, cantidad] of Object.entries(S.charms)) {
        const charmCard = document.getElementById('ch-' + charmId);
        let charmName = charmId;

        if (charmCard) {
          const nameEl = charmCard.querySelector('.charm-name');
          if (nameEl) {
            charmName = nameEl.textContent.trim();
          }
        }

        accesorios.push(`${charmName} (x${cantidad})`);
      }
    }

    let monto = 0;
    if (S.shipping) {
      monto = S.shipping.subtotal + S.shipping.cost;
      if (discountState && discountState.applied) {
        monto -= discountState.descuento_monto;
      }
    }

    return {
      nombre,
      email,
      telefono,
      direccion,
      localidad,
      notas,
      accesorios: accesorios.join('\n'),
      monto: Math.round(monto)
    };

  } catch (error) {
    console.error('Error recolectando datos:', error);
    return null;
  }
}

function mostrarModalPago(pedido) {
  const modal = document.createElement('div');
  modal.id = 'payment-modal';
  modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;`;

  modal.innerHTML = `
    <div style="background: white; padding: 40px; border-radius: 12px; max-width: 500px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <h2 style="margin: 0 0 20px 0; color: #333;">💳 Instrucciones de Pago</h2>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">
        <p style="margin: 0 0 10px 0; color: #666;"><strong>Transferencia bancaria a:</strong></p>
        <p style="margin: 0 0 15px 0; font-size: 18px; color: #000;"><strong>Llave Bancolombia:</strong></p>
        <div style="background: white; padding: 12px; border: 2px solid #ddd; border-radius: 6px; margin: 0 0 10px 0; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-family: monospace; font-weight: bold; color: #333;">CUATROPAJAROS@ICLOUD.COM</span>
          <button onclick="copyToClipboard('CUATROPAJAROS@ICLOUD.COM')" style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Copiar</button>
        </div>
        <p style="margin: 10px 0; color: #666;"><strong>Monto a transferir:</strong></p>
        <p style="margin: 0; font-size: 24px; color: #2196F3; font-weight: bold;">$${pedido.monto.toLocaleString('es-CO')}</p>
      </div>
      <p style="margin: 15px 0; color: #666; font-size: 14px;">Una vez realices la transferencia, haz clic en "Confirmar Pago Realizado"</p>
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="confirmarPagoEnAirtable()" style="flex: 1; background: #4CAF50; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer;">✓ Confirmar Pago Realizado</button>
        <button onclick="cerrarModalPago()" style="flex: 1; background: #ccc; color: #333; border: none; padding: 12px 20px; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer;">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function confirmarPagoEnAirtable() {
  if (!pedidoActualRecordId) {
    showError('No hay pedido para confirmar');
    return;
  }

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_CONFIG.baseId}/${AIRTABLE_CONFIG.tableId}/${pedidoActualRecordId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'estado': 'Pago Confirmado por Cliente',
          'Timestamp Confirmación Pago': new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error Airtable:', error);
      showError('Error al confirmar pago: ' + (error.error?.message || 'Error desconocido'));
      return;
    }

    cerrarModalPago();
    mostrarModalConfirmacion();

  } catch (error) {
    console.error('Error:', error);
    showError('Error al confirmar pago: ' + error.message);
  }
}

function mostrarModalConfirmacion() {
  const modal = document.createElement('div');
  modal.id = 'confirmation-modal';
  modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;`;

  modal.innerHTML = `
    <div style="background: white; padding: 40px; border-radius: 12px; max-width: 500px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <h2 style="margin: 0 0 20px 0; color: #4CAF50;">✓ ¡Pedido Confirmado!</h2>
      <p style="margin: 20px 0; color: #666; font-size: 16px; line-height: 1.6;">Tu pago ha sido registrado correctamente. En breve recibirás un email de confirmación con los detalles de tu pedido y el estado de entrega.</p>
      <p style="margin: 15px 0; color: #999; font-size: 14px;">Gracias por tu compra en Cuatro Pájaros ✨</p>
      <button onclick="cerrarYLimpiar()" style="background: #4CAF50; color: white; border: none; padding: 12px 30px; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; margin-top: 20px;">Cerrar</button>
    </div>
  `;

  document.body.appendChild(modal);
}

function cerrarModalPago() {
  const modal = document.getElementById('payment-modal');
  if (modal) modal.remove();
}

function cerrarYLimpiar() {
  const confirmModal = document.getElementById('confirmation-modal');
  if (confirmModal) confirmModal.remove();

  const paymentModal = document.getElementById('payment-modal');
  if (paymentModal) paymentModal.remove();

  S.charms = {};
  discountState = { applied: false, descuento_monto: 0, codigo: '' };
  pedidoActualRecordId = null;

  if (typeof upd === 'function') {
    upd();
  }

  goToStep(1);
}

function showError(message) {
  alert('❌ Error: ' + message);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('✓ Llave copiada al portapapeles');
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('✓ Llave copiada al portapapeles');
  });
}
