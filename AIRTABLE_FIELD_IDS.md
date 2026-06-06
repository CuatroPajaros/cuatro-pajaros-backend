# Airtable Field IDs - Cuatro Pájaros Backend

## Base Configuration
- **Base ID**: `appHc3E8X4q0kdps0`
- **Table ID**: `tblLfvkCVikoR3vt1`
- **Airtable URL**: https://airtable.com/appHc3E8X4q0kdps0/tblLfvkCVikoR3vt1

## Field IDs Mapping

### Customer Information
| Campo | Field ID | Descripción |
|-------|----------|-------------|
| nombre_cliente | `fldyWUX7pJo62sc3c` | Nombre del cliente |
| email | `fldwVpsz2Qfl6Zrzf` | Email del cliente |
| telefono | `fldmddUSROBNmfUU9` | Teléfono de contacto |
| direccion | `flduOyuBmNCs402qe` | Dirección de envío |
| Localidad | `fld3lYy1RKtrF5JFK` | Localidad/Ciudad |

### Order Details
| Campo | Field ID | Descripción |
|-------|----------|-------------|
| tamaño_journal | `fld19Qdx6S0OFGAiU` | Tamaño del journal |
| color_cuero | `fld9CHgNndOyyqogs` | Color del cuero |
| color_ojales | `fldmAv2wyttj2RKXg` | Color de los ojales |
| color_cordon | `fldVkKF0QZTZhs0sz` | Color del cordón |
| libretas_detalles | `fld2ufRUJ9zVx8O43` | Detalles de las libretas seleccionadas |
| charms_detalles | `fldFquamDL72OY3ED` | Detalles de los charms/accesorios |
| pochette | `fldaX1NvwN8ltlQN1` | Si incluye pochette (Sí/No) |
| precio_libretas | `fldeNQA2MZglrMnRh` | Precio total de libretas seleccionadas |
| descuento_codigo | `fld2UMLJ7ruZL6cqy` | Código de descuento aplicado |
| descuento_monto | `fldv9YqqY54elqAVw` | Monto del descuento en pesos |

### Administrative Fields
| Campo | Field ID | Descripción |
|-------|----------|-------------|
| numero_pedido | `fldjztgomIIc4ms3U` | Número único del pedido (YYMMDD-XX) |
| notas_adicionales | `fldUjgcSInu4vIO3c` | Notas adicionales del cliente |
| total | `fldFkBXdCipH1XWZH` | Monto total del pedido |
| estado | `fld2Ho4dKREFcCfcC` | Estado del pedido |
| fecha | `fldN0VWlkUScEvs0a` | Fecha de creación del pedido (zona horaria Bogotá) |
| timestamp_creacion_pedido | `fldi7piFPEAwhhdBt` | Timestamp cuando se abre el modal de pago (intención de compra) |

## Usado en Netlify Functions

### crear-pedido.mjs
Este archivo utiliza los Field IDs anteriores para mapear los datos del pedido al crear un nuevo registro en Airtable. Los Field IDs están hardcodeados en la función (líneas 41-57).

```javascript
const record = {
  fields: {
    'fldyWUX7pJo62sc3c': pedido.nombre_cliente,        // nombre_cliente
    'fldwVpsz2Qfl6Zrzf': pedido.email,                  // email
    'fldmddUSROBNmfUU9': pedido.telefono,               // telefono
    'flduOyuBmNCs402qe': pedido.direccion,             // direccion
    'fld3lYy1RKtrF5JFK': pedido.Localidad,             // Localidad
    'fldUjgcSInu4vIO3c': pedido.notas_adicionales || '', // notas_adicionales
    'fldFquamDL72OY3ED': pedido.charms_detalles || '',  // charms_detalles
    'fldFkBXdCipH1XWZH': pedido.total || 0,             // total
    'fld2Ho4dKREFcCfcC': pedido.estado || 'Pedido Solicitado', // estado
    'fldN0VWlkUScEvs0a': new Date().toISOString(),      // fecha
    // Campos de detalles del pedido
    'fld19Qdx6S0OFGAiU': pedido.tamaño || '',           // tamaño_journal
    'fld9CHgNndOyyqogs': pedido.color_customer || '',   // color_cuero
    'fldmAv2wyttj2RKXg': pedido.color_ojeria || '',     // color_ojales
    'fldVkKF0QZTZhs0sz': pedido.color_cordon || '',     // color_cordon
    'fld2ufRUJ9zVx8O43': pedido.libretas_detalles || '', // libretas_detalles
    'fldaX1NvwN8ltlQN1': pedido.pochette || ''          // pochette
  }
};
```

## Frontend Field Mapping

En `index.html`, la función `recolectarDatosPedido()` extrae los valores del configurador y la función `crearPedido()` los mapea a los nombres esperados por el backend:

```javascript
const datosPedido = {
  nombre_cliente: pedido.nombre,
  email: pedido.email,
  telefono: pedido.telefono,
  direccion: pedido.direccion,
  Localidad: pedido.localidad,
  tamaño: pedido.tamaño,
  color_customer: pedido.color_customer,
  color_ojeria: pedido.color_ojeria,
  color_cordon: pedido.color_cordon,
  libretas_detalles: pedido.libretas,
  charms_detalles: pedido.accesorios,
  pochette: pedido.pochette,
  notas_adicionales: pedido.notas || '',
  total: pedido.monto,
  estado: 'Pedido Solicitado',
  fecha: new Date().toISOString()
};
```

## Notas Importantes

1. Los Field IDs son específicos de esta base de Airtable y no se pueden transferir a otras bases
2. Si se agregan nuevos campos a la tabla de Airtable, será necesario actualizar ambos archivos:
   - `netlify/functions/crear-pedido.mjs` (con el nuevo Field ID)
   - `index.html` (en recolectarDatosPedido y datosPedido si aplica)
3. El mapping de nombres entre frontend y backend debe mantenerse consistente

## Última Actualización
- **Fecha**: 27 de Mayo 2026
- **Cambios**: Reemplazo de placeholder Field IDs con IDs correctos de Airtable, agregado soporte para pochette
- **Commit**: `2861309`
