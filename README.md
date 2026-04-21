# Pedidos WhatsApp

Base web estática para tomar pedidos de distintos clientes y compartirlos por WhatsApp.

## Cliente actual

- `rivadavia`

## Estructura

- [index.html](./index.html): entrada local/default.
- [clients.js](./clients.js): configuración por cliente.
- [app.js](./app.js): lógica compartida.
- [rivadavia/index.html](./rivadavia/index.html): subruta lista para GitHub Pages.

## Cómo funciona

La app detecta el cliente activo y carga su configuración:

- Google Sheet
- logo
- textos de interfaz
- espesores visibles

Hoy `rivadavia` usa:

- `espesor = 3` como `3 mm`
- `espesor = 15` como `15 mm`

## Agregar un nuevo cliente

1. Agregar una nueva entrada en [clients.js](./clients.js).
2. Crear una carpeta con su subruta, por ejemplo `moreira/`.
3. Copiar un `index.html` lanzador como el de [rivadavia/index.html](./rivadavia/index.html) y cambiar:
   - `window.APP_CLIENT_KEY`
   - `window.APP_ASSET_PREFIX` si hiciera falta

## GitHub Pages

Con esta estructura podés publicar rutas como:

- `/Pedidos_wpp/rivadavia/`
- `/Pedidos_wpp/moreira/`

Cada subruta usa la misma lógica compartida, pero carga solo la configuración del cliente correspondiente.
