const DEFAULT_TO = "mymfibrofacil@gmail.com,mymfibrofacil.web@gmail.com";
const DEFAULT_SUBJECT_PREFIX = "Moreira";
const PRINT_NOTIFICATION_TO = DEFAULT_TO;
const PRINT_SUBJECT_PREFIX = "[IMPRIMIR XUBIO]";

// Configuracion de Xubio. Los dos secretos se guardan solamente en Script
// Properties, nunca en este archivo ni en GitHub.
const XUBIO = {
  tokenUrl: "https://xubio.com/API/1.1/TokenEndpoint",
  clienteUrl: "https://xubio.com/API/1.1/clienteBean",
  listaPrecioUrl: "https://xubio.com/API/1.1/listaPrecioBean",
  presupuestoUrl: "https://xubio.com/API/1.1/presupuestoBean",
  productId: 1811046,
  defaults: {
    puntoVentaId: 125761,
    depositoId: 1731,
    provinciaId: 1,
    vendedorId: 12412,
    condicionDePago: 2,
    centroCostoId: 66456,
  },
  clientsById: {
    "7756831": {
      id: 7756831,
      name: "CARPINTERIA RIVADAVIA SA",
      listaPrecioId: 10194,
      priceFromList: true,
      productsByThickness: { "3": 2465942, "15": 2465943 },
    },
    "5481719": { id: 5481719, name: "ALEJANDRO FABIAN MOREIRA DUPLAA" },
    "5482182": { id: 5482182, name: "HORACIO MAXIMILIANO NERVI / Valeria Lotz" },
  },
  clientsByKey: {
    rivadavia: "7756831",
    moreira: "5481719",
    valeria: "5482182",
  },
};

function doPost(e) {
  try {
    const payload = getPayload(e);
    const now = new Date();
    const subject =
      String(payload.subject || "").trim() ||
      `${DEFAULT_SUBJECT_PREFIX} - ${Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy")}`;
    const body = String(payload.body || "").trim();
    const to = String(payload.to || DEFAULT_TO).trim();

    if (!body) {
      return jsonResponse({ ok: false, error: "Falta el cuerpo del pedido." });
    }

    let presupuesto = { created: false, skipped: true };
    let xubioError = "";
    let printError = "";
    if (payload.order_data || payload.orderData) {
      try {
        presupuesto = crearPresupuestoXubio(payload);
      } catch (error) {
        xubioError = error && error.message ? error.message : "Error desconocido al crear el presupuesto.";
        console.error(error && error.stack ? error.stack : xubioError);
      }
    }

    if (!xubioError && presupuesto.transaccionId) {
      try {
        enviarOrdenImpresionXubio(presupuesto, subject);
      } catch (error) {
        printError = error && error.message ? error.message : "Error desconocido al enviar la orden de impresion.";
        console.error(error && error.stack ? error.stack : printError);
      }
    }

    const reviewPrefix = xubioError ? "[REVISAR XUBIO] " : printError ? "[REVISAR IMPRESION] " : "";
    const emailSubject = `${reviewPrefix}${subject}`;
    const notes = [];
    if (xubioError) notes.push(`No se pudo crear el presupuesto automatico en Xubio.\nError: ${xubioError}`);
    if (printError) notes.push(`El presupuesto se creo, pero no se pudo enviar la orden de impresion.\nError: ${printError}`);
    const emailBody = notes.length ? `${body}\n\n---\n${notes.join("\n\n")}` : body;

    GmailApp.sendEmail(to, emailSubject, emailBody, {
      name: "Pedidos a medida",
      replyTo: String(payload.from || "").trim() || undefined,
    });

    return jsonResponse({ ok: !xubioError && !printError, presupuesto, error: xubioError || printError || undefined });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : "Error desconocido",
    });
  }
}

function getPayload(e) {
  const params = (e && e.parameter) || {};
  if (params.body || params.subject || params.to || params.from) {
    return params;
  }

  return JSON.parse((e && e.postData && e.postData.contents) || "{}");
}

function crearPresupuestoXubio(payload) {
  const requestedClientId = Number(
    payload.client_id || payload.clientId || payload.cliente_id || payload.clienteId
  );
  const clientKey = String(payload.client_key || payload.clientKey || "").trim().toLowerCase();
  const resolvedClientId = Number.isInteger(requestedClientId) && requestedClientId > 0
    ? String(requestedClientId)
    : XUBIO.clientsByKey[clientKey];
  const client = XUBIO.clientsById[resolvedClientId];
  if (!client) {
    throw new Error("El pedido no corresponde a un cliente habilitado para Xubio.");
  }

  const order = parseOrderData(payload.order_data || payload.orderData);
  const idempotencyKey = `xubio-presupuesto-${client.id}-${order.orderId}`;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const existing = properties.getProperty(idempotencyKey);
    if (existing) {
      return { created: false, duplicate: true, ...JSON.parse(existing) };
    }

    const token = getXubioToken();
    const customer = xubioFetchJson(`${XUBIO.clienteUrl}/${client.id}`, token, "get");
    const listaPrecio = customer && customer.listaPrecioVenta;
    const listaPrecioId = Number(
      client.listaPrecioId || (listaPrecio && (listaPrecio.ID || listaPrecio.id))
    );
    if (!Number.isFinite(listaPrecioId) || listaPrecioId <= 0) {
      throw new Error(`Xubio no devolvio la lista de precios para ${client.name}.`);
    }

    const listaPrecioDetalle = client.priceFromList
      ? xubioFetchJson(`${XUBIO.listaPrecioUrl}/${listaPrecioId}`, token, "get")
      : null;

    const result = xubioFetchJson(
      XUBIO.presupuestoUrl,
      token,
      "post",
      buildPresupuestoPayload(client, listaPrecioId, order, listaPrecioDetalle)
    );
    const record = {
      created: true,
      createdAt: new Date().toISOString(),
      presupuestoId: result && (result.ID || result.id || result.presupuestoId) || null,
      transaccionId: Number(result && (result.transaccionid || result.transaccionId)) || null,
      orderId: order.orderId,
      clientKey: resolvedClientId,
    };
    properties.setProperty(idempotencyKey, JSON.stringify(record));
    return record;
  } finally {
    lock.releaseLock();
  }
}

function enviarOrdenImpresionXubio(presupuesto, subject) {
  const transaccionId = Number(presupuesto && presupuesto.transaccionId);
  const orderId = String(presupuesto && presupuesto.orderId || "").trim();
  if (!Number.isFinite(transaccionId) || transaccionId <= 0 || !orderId) {
    throw new Error("Xubio creo el presupuesto, pero no devolvio los datos necesarios para imprimirlo.");
  }

  const properties = PropertiesService.getScriptProperties();
  const printKey = `xubio-print-${String(presupuesto.clientKey || "pedido")}-${orderId}`;
  if (properties.getProperty(printKey)) return;

  const job = {
    transaccionId,
    orderId,
    clientKey: String(presupuesto.clientKey || ""),
  };
  GmailApp.sendEmail(
    PRINT_NOTIFICATION_TO,
    `${PRINT_SUBJECT_PREFIX} ${subject}`,
    `Orden interna para imprimir un presupuesto ya creado en Xubio.\nXUBIO_PRINT_JOB: ${JSON.stringify(job)}`,
    { name: "Pedidos a medida" }
  );
  properties.setProperty(printKey, new Date().toISOString());
}

function parseOrderData(raw) {
  let order;
  try {
    order = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_error) {
    throw new Error("No se pudo leer el detalle del pedido para Xubio.");
  }

  const orderId = String(order && order.orderId || "").trim();
  const items = Array.isArray(order && order.items) ? order.items : [];
  if (!orderId || items.length === 0) {
    throw new Error("El pedido no tiene renglones validos para crear el presupuesto.");
  }

  const normalizedItems = items.map((item) => {
    const descripcion = String(item.descripcion || "").trim();
    const cantidad = Number(item.cantidad);
    const precio = Number(item.precio);
    const productoId = item.productoId === undefined || item.productoId === null || item.productoId === ""
      ? null
      : Number(item.productoId);
    if (!descripcion || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(precio) || precio < 0) {
      throw new Error("Hay un renglon con descripcion, cantidad o precio invalido.");
    }
    if (productoId !== null && (!Number.isInteger(productoId) || productoId <= 0)) {
      throw new Error("Hay un renglon con producto Xubio invalido.");
    }
    return {
      descripcion,
      cantidad,
      precio,
      productoId,
      espesor: String(item.espesor || "").trim(),
    };
  });
    return { orderId, items: normalizedItems };
  }

function getListaPrecioItemPrice(listaPrecioDetalle, productoId) {
  const items = listaPrecioDetalle && Array.isArray(listaPrecioDetalle.listaPrecioItem)
    ? listaPrecioDetalle.listaPrecioItem
    : [];
  const match = items.find((item) => {
    const producto = item && item.producto;
    return producto && Number(producto.ID || producto.id) === Number(productoId);
  });
  const price = Number(match && match.precio);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Xubio no devolvio precio para el producto ${productoId} en la lista ${listaPrecioDetalle && (listaPrecioDetalle.ID || listaPrecioDetalle.id) || "solicitada"}.`);
  }
  return price;
}

function buildPresupuestoPayload(client, listaPrecioId, order, listaPrecioDetalle) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const items = order.items.map((item) => {
    const productoId = Number(
      item.productoId ||
      (client.productsByThickness && client.productsByThickness[String(item.espesor)]) ||
      XUBIO.productId
    );
    const precio = client.priceFromList
      ? getListaPrecioItemPrice(listaPrecioDetalle, productoId)
      : item.precio;
    const itemSubtotal = roundMoney(item.cantidad * precio);
    return {
      producto: { ID: productoId, id: productoId },
      centroDeCosto: { ID: XUBIO.defaults.centroCostoId, id: XUBIO.defaults.centroCostoId },
      deposito: { ID: XUBIO.defaults.depositoId, id: XUBIO.defaults.depositoId },
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio,
      iva: 0,
      montoExento: itemSubtotal,
      importe: itemSubtotal,
      total: itemSubtotal,
      porcentajeDescuento: 0,
    };
  });
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));

  return {
    externalId: `WEB-${order.orderId}`,
    cliente: { ID: client.id, id: client.id },
    nombre: `Pedido web - ${client.name}`,
    descripcion: "Presupuesto creado automaticamente desde Pedidos a medida.",
    fecha: date,
    fechaVto: date,
    puntoVenta: { ID: XUBIO.defaults.puntoVentaId, id: XUBIO.defaults.puntoVentaId },
    deposito: { ID: XUBIO.defaults.depositoId, id: XUBIO.defaults.depositoId },
    provincia: { ID: XUBIO.defaults.provinciaId, id: XUBIO.defaults.provinciaId },
    listaDePrecio: { ID: listaPrecioId, id: listaPrecioId },
    vendedor: { vendedorId: XUBIO.defaults.vendedorId },
    condicionDePago: XUBIO.defaults.condicionDePago,
    cotizacion: 1,
    cotizacionListaDePrecio: 1,
    importeGravado: 0,
    importeImpuestos: 0,
    importetotal: total,
    facturaNoExportacion: true,
    transaccionProductoItems: items,
  };
}

function getXubioToken() {
  const properties = PropertiesService.getScriptProperties();
  const clientId = String(properties.getProperty("XUBIO_CLIENT_ID") || "").trim();
  const clientSecret = String(properties.getProperty("XUBIO_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan XUBIO_CLIENT_ID o XUBIO_CLIENT_SECRET en las propiedades del Script.");
  }

  const response = UrlFetchApp.fetch(XUBIO.tokenUrl, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: "grant_type=client_credentials",
    headers: { Authorization: `Basic ${Utilities.base64Encode(`${clientId}:${clientSecret}`)}` },
    muteHttpExceptions: true,
  });
  const data = parseXubioResponse(response, "obtener el token");
  if (!data.access_token) throw new Error("Xubio no devolvio access_token.");
  return data.access_token;
}

function xubioFetchJson(url, token, method, payload) {
  const options = {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  return parseXubioResponse(UrlFetchApp.fetch(url, options), "comunicarse con Xubio");
}

function parseXubioResponse(response, action) {
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Xubio no pudo ${action} (HTTP ${status}): ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error(`Xubio devolvio una respuesta no valida al ${action}.`);
  }
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
