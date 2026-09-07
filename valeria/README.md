# Pedidos Valeria Lotz

Esta carpeta contiene la entrada directa de la app de pedidos de Valeria Lotz.

## Catalogo

La aplicación usa la copia de Google Sheets configurada como `valeria` en `../clients.js`, específicamente la pestaña `Catálogo App`.

Cada fila es un producto que se puede pedir. Las columnas requeridas son:

```text
Sección | Categoría | Producto | Modelo | Precio | Tipo
```

La app crea una pestaña por `Sección` y una card desplegable por `Categoría`. `Modelo` es opcional y se muestra debajo del producto. `Precio` debe ser numerico.

## Envio

Actualmente el pedido se copia al portapapeles y abre WhatsApp para que el cliente elija el destinatario. Para cambiarlo a envio por correo, completar `emailTo` y `sendEndpoint` en `../clients.js` y reutilizar o crear un Apps Script de correo.

## Acceso a la hoja

Para que la app publicada pueda cargar el catalogo, la hoja de Google debe estar compartida como **Cualquier persona con el enlace: Lector**. No hace falta otorgar permisos de edicion.
