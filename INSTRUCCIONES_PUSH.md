# ⚠️ IMPORTANTE: PUSH PENDIENTE

El servidor local tiene cambios que NO han sido pusheados a GitHub.

## Cambios pendientes:
- Commit: da14805 "Add discount and notes fields to Airtable mapping"

## El problema:
- Render está corriendo una VERSIÓN VIEJA del servidor
- Por eso NO se guardan: descuento_codigo, descuento_monto, notas_adicionales

## Solución INMEDIATA (desde tu Mac):
```bash
cd /Users/fernandavanegas/cuatro-pajaros-backend
git push origin main
```

Esto dispará un redeploy automático en Render en 2-5 minutos.

## Después de esto:
- Los tres campos empezarán a guardarse en Airtable
- Verifica que los nombres coincidan: descuento_codigo, descuento_monto, notas_adicionales
