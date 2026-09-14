1. Crea un proyecto nuevo de Google Apps Script con la cuenta `mymfibrofacil.web@gmail.com`.
2. Copia el contenido de `Code.gs` en el editor.
3. Configura la zona horaria del proyecto si quieres que la fecha del asunto use tu horario local.
4. Despliega como `Web app`:
   Ejecutar como: `mymfibrofacil.web@gmail.com`
   Acceso: `Anyone`
5. Copia la URL del despliegue.
6. Pega esa URL en `sendEndpoint` dentro de `clients.js` para `moreira`.

El asunto se envía como `Moreira - dd/mm/aaaa`.
El remitente real será la cuenta dueña del Apps Script que haga el despliegue y se mostrará como `Pedidos a medida`.
El remitente esperado del despliegue es `mymfibrofacil.web@gmail.com`.
Los destinatarios por defecto son `mymfibrofacil@gmail.com` y `mymfibrofacil.web@gmail.com`.
El frontend envia el pedido con un `form POST`, similar al esquema usado en `Sistema Dojo/formulario_datos`.

## Presupuestos automáticos en Xubio

Para Moreira y Valeria, el mismo `doPost` crea un presupuesto antes de enviar el mail.
Cada renglón usa el producto `Particular` (`1811046`) y conserva la descripción, cantidad y precio que eligió el cliente.

Para Rivadavia, el mismo `doPost` crea dos posibles renglones agrupados por espesor:

- 3 mm: `S- Corte Placa 3mm` (`2465942`)
- 15 mm: `S- Corte Placa 15mm` (`2465943`)

Las cantidades salen del total de placas del pedido y los precios se leen de la lista Xubio `10194`.

En **Project Settings → Script properties** carga, sin comillas:

- `XUBIO_CLIENT_ID`
- `XUBIO_CLIENT_SECRET`

No subas esas credenciales al repositorio ni las dejes en `Code.gs`.
El código usa los datos operativos de la primera versión: punto de venta `125761`, depósito `1731`, provincia `1`, vendedor `12412` y centro de costo `66456`. Confírmalos en Xubio antes de desplegar.

El identificador del pedido se guarda en las propiedades del Script después de que Xubio lo acepta. Así, dos envíos del mismo botón no crean dos presupuestos.
