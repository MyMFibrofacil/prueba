# Pedidos WhatsApp

App web estatica para tomar pedidos por cliente y compartir el resultado por WhatsApp o mail, segun la configuracion activa.

Hoy el foco principal de este repo esta en `Rivadavia`, que usa Google Sheets como fuente de datos y genera el pedido final para WhatsApp.

## Estructura

- [index.html](./index.html): portada local con acceso a cada cliente.
- [clients.js](./clients.js): configuracion por cliente.
- [app.js](./app.js): logica compartida de carga, render, resumen y envio.
- [rivadavia/index.html](./rivadavia/index.html): entrada directa para Rivadavia.
- [moreira/index.html](./moreira/index.html): entrada directa para Moreira.
- [valeria/index.html](./valeria/index.html): entrada directa para Valeria Lotz.
- [google_apps_script/moreira_mailer/Code.gs](./google_apps_script/moreira_mailer/Code.gs): envio por mail usado por Moreira.

## Como abrir la app

No hay backend ni `main.py`. Es una app estatica.

Opciones recomendadas:

1. Abrir la subcarpeta del cliente, por ejemplo [rivadavia/index.html](./rivadavia/index.html), [moreira/index.html](./moreira/index.html) o [valeria/index.html](./valeria/index.html).
2. Abrir [index.html](./index.html) si queres usar la portada selector.
3. Mejor: servir la carpeta con `Live Server` o cualquier servidor estatico local.

Ejemplo:

```text
http://127.0.0.1:5500/rivadavia/index.html
```

## Deteccion de cliente

La app detecta el cliente activo en este orden:

1. `window.APP_CLIENT_KEY`
2. querystring (`?client=` o `?cliente=`)
3. ultimo segmento de la URL
4. fallback a `rivadavia`

Las subrutas ya fijan el cliente desde su `index.html`.

## Configuracion por cliente

La configuracion vive en [clients.js](./clients.js).

### Rivadavia

- `sheetId`: origen de datos en Google Sheets
- `sheetGid`: hoja a leer
- `thicknessMeta`:
  - `3` => `3 mm`
  - `15` => `15 mm`
- `sendMode`: WhatsApp

### Moreira

- usa otro `sheetId`
- trabaja con `kits`, `individuales` y `letras`
- resume por valor
- envia por mail a traves de Apps Script

### Valeria Lotz

- usa la pestaña `Catálogo App` de su Google Sheet como catálogo técnico.
- muestra secciones y categorias desplegables para que el cliente cargue cantidades con controles `+` y `-`.
- calcula el total en pesos y prepara el pedido para WhatsApp.
- la hoja debe permanecer disponible como **lector mediante enlace** para que el catalogo pueda cargarse desde la app publicada.

Columnas usadas en `Catálogo App`:

- `Sección`
- `Categoría`
- `Producto`
- `Modelo`
- `Precio`
- `Tipo`

La columna opcional `Activo` permite ocultar un producto con los valores `No`, `False` o `0`.

## Modelo de datos actual de Rivadavia

La hoja de Rivadavia se lee desde Google Sheets y hoy la app soporta dos formatos:

### Formato recomendado

Separar la placa en su propia columna.

Columnas esperadas:

- `Familia`
- `Producto`
- `placas`
- `espesor`
- `tipo`
- `placa`

Tambien se aceptan estos nombres equivalentes para la columna de placa:

- `placa_corte`
- `placa de corte`
- `medida_placa`
- `medida de placa`

### Formato viejo

Si no existe columna de placa, la app intenta inferirla desde `Familia` con formato:

```text
GL15 - 260x183
1224 - 282x183
```

En ese caso:

- familia base: `GL15`
- placa: `260x183`

## Tipos de fila en Rivadavia

### `grupo`

Representa una familia compuesta por varios graficos/productos que se piden en bloque.

#### Grupo con una sola placa

Ejemplo conceptual:

```text
GL15
placa: 260x183
```

Comportamiento:

- la familia sigue cargandose con una sola cantidad
- la UI muestra `Placa de referencia: 260x183`
- el detalle interno multiplica todos los graficos por la cantidad elegida
- WhatsApp sale con formato:

```text
GL15
- Placa 260x183 (1 copia)
  - Grafico 1: 50 placas
  - Grafico 2: 34 placas
```

#### Grupo con varias placas

Ejemplo conceptual:

```text
1224
placas disponibles: 282x183, 275x183
```

Comportamiento:

- la familia aparece una sola vez
- cada placa aparece como sub-bloque colapsado
- la cantidad se carga por placa, no por grafico
- los graficos internos se calculan como multiplo fijo de esa placa
- no se pueden mezclar cantidades inconsistentes por grafico

Ejemplo:

- `Placa 282x183`, cantidad `2`
- `Grafico 1: 54 x 2 = 108`
- `Grafico 2: 18 x 2 = 36`

WhatsApp sale con formato:

```text
1224
- Placa 282x183 (2 copias)
  - Grafico 1: 108 placas
  - Grafico 2: 36 placas
```

### `individual`

Representa productos que no se manejan como grupo cerrado.

Comportamiento:

- todos se agrupan visualmente bajo la familia `Individuales`
- cada producto se carga por separado
- si existe placa asociada, se muestra al lado del nombre del producto

Ejemplos visibles:

- `Cajones - 260x183`
- `Esquema 16P - 260x183`

WhatsApp sale con formato:

```text
*3mm*
Individuales
- Cajones - 260x183: 50 placas
- Esquema 16P - 260x183: 45 placas
```

## Como construye la UI Rivadavia

Flujo general en [app.js](./app.js):

1. Detecta cliente activo.
2. Lee Google Sheets.
3. Agrupa por espesor.
4. Dentro de cada espesor:
   - agrupa familias `grupo`
   - detecta si tienen una sola placa o varias
   - agrupa `individual` bajo `Individuales`
5. Renderiza:
   - tabs por espesor
   - cards de familia
   - detalle/resumen fijo abajo
6. Genera el texto final y lo abre en WhatsApp.

## Formato del mensaje de WhatsApp en Rivadavia

El mensaje final intenta respetar esta jerarquia:

1. espesor
2. familia
3. placa
4. detalle de graficos o productos
5. resumen final

Ejemplo simplificado:

```text
*3mm*
GL15
- Placa 260x183 (1 copia)
  - Grafico 1: 50 placas
  - Grafico 2: 34 placas

Individuales
- Cajones - 260x183: 50 placas

RESUMEN FINAL
*Total 3 mm: 134 placas*
*Total general: 134 items*
```

Nota: el texto de `Total general` sigue saliendo como `items` porque esa etiqueta general todavia usa el comportamiento compartido actual.

## Agregar un nuevo cliente

1. Agregar una nueva entrada en [clients.js](./clients.js).
2. Crear su carpeta, por ejemplo `nuevo_cliente/`.
3. Copiar un `index.html` lanzador como [rivadavia/index.html](./rivadavia/index.html).
4. Ajustar:
   - `window.APP_CLIENT_KEY`
   - `window.APP_ASSET_PREFIX`
   - `sheetId`, `sheetGid` y textos de interfaz en `clients.js`

## GitHub Pages

Con esta estructura se pueden publicar rutas como:

- `/Pedidos_wpp/rivadavia/`
- `/Pedidos_wpp/moreira/`
- `/Pedidos_wpp/valeria/`

Cada subruta usa la misma logica compartida, pero carga solo la configuracion del cliente correspondiente.
