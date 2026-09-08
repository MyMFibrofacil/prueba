# Pedidos Valeria Lotz

Esta carpeta contiene la entrada directa de la app de pedidos de Valeria Lotz. Incluye su propio `app.js` de inicio para que pueda publicarse en el repositorio actual, que mantiene el controlador compartido como `controller.js` en la raíz.

## Catalogo

La aplicación usa la copia de Google Sheets configurada como `valeria` en `../clients.js`, específicamente la pestaña `Catálogo App`.

Cada fila es un producto que se puede pedir. Las columnas requeridas son:

```text
Sección | Categoría | Producto | Modelo | Precio | Tipo
```

Al abrir el enlace, la app muestra una pestaña inicial con todas las `Categorías`. Al tocar una, se abre su lista de productos y se puede volver a la vista de categorías. También conserva las pestañas por `Sección`. `Modelo` es opcional y se muestra debajo del producto. `Precio` debe ser numerico.

## Envio

El pedido se envía por correo a `mymfibrofacil@gmail.com` y `mymfibrofacil.web@gmail.com` mediante el mismo Apps Script de Moreira. El asunto se genera como `Valeria Lotz - dd/mm/aaaa` y el pedido también se copia al portapapeles.

## Acceso a la hoja

Para que la app publicada pueda cargar el catalogo, la hoja de Google debe estar compartida como **Cualquier persona con el enlace: Lector**. No hace falta otorgar permisos de edicion.
