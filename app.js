(() => {
  const api = window.PedidosApp || {};
  if (api.createClientContext && api.createAppState && api.getDomElements) {
    const clientContext = api.createClientContext();
    const state = api.createAppState(clientContext.thicknessMeta, clientContext.lettersConfig);
    const html = api.getDomElements();
    api.createAppController({ ...clientContext, html, state }).init();
    return;
  }

  // Compatibilidad con la version publicada en GitHub Pages, donde solo se
  // cargan clients.js, controller.js y este archivo.
  const clientKey = String(window.APP_CLIENT_KEY || "rivadavia").trim().toLowerCase();
  const clientConfig = window.PEDIDOS_CLIENTS?.[clientKey];
  if (!clientConfig || !api.createAppController) {
    console.error("No se pudo iniciar Pedidos: falta la configuracion o el controlador.");
    return;
  }

  const fallbackLetters = {
    materialLabel: "MDF 5 mm",
    priceRowLabel: "$ Unit",
    taxRate: 0.21,
    sizes: ["22", "27", "33"],
    quickSteps: [1, 5, 10],
    filters: [{ id: "all", label: "Todas" }],
    letters: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "Ñ", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
  };
  const lettersConfig = { ...fallbackLetters, ...(clientConfig.lettersConfig || {}) };
  const emptyQuantities = Object.fromEntries(
    lettersConfig.letters.map((letter) => [
      letter,
      Object.fromEntries(lettersConfig.sizes.map((size) => [size, 0])),
    ])
  );
  const state = {
    activeThickness: Object.keys(clientConfig.thicknessMeta || {})[0] || "",
    catalog: [],
    emailSubmissionPending: false,
    familyQuantities: {},
    kitGroupOpenState: {},
    letterState: {
      step: lettersConfig.quickSteps[0] || 1,
      filter: lettersConfig.filters[0]?.id || "all",
      prices: Object.fromEntries(lettersConfig.sizes.map((size) => [size, 0])),
      quantities: emptyQuantities,
    },
    materialQuantities: {},
    pendingEmailStatusMessage: "",
    productQuantities: {},
    scrollButtonTimer: null,
    searchTerm: "",
    statusTimer: null,
    summaryOpen: false,
    toastTimer: null,
    variantQuantities: {},
  };
  const byId = (id) => document.getElementById(id);
  const html = {
    catalogScroll: byId("catalog-scroll"), closeDesigns: byId("close-designs"), designsModal: byId("designs-modal"),
    emailForm: byId("email-send-form"), emailFrame: byId("email-send-target"), empty: byId("empty-state"),
    families: byId("families-container"), logo: byId("app-logo"), openDesigns: byId("open-designs"),
    scrollToBottom: byId("scroll-to-bottom"), search: byId("search-input"), searchWrapper: byId("search-wrapper"),
    sendButton: byId("send-whatsapp"), sendButtonLabel: byId("send-button-label"), status: byId("status-message"),
    summaryChevron: byId("summary-chevron"), summaryDetailsList: byId("summary-details-list"),
    summaryDetailsPanel: byId("summary-details-panel"), summaryTitle: byId("summary-title"),
    summaryToggle: byId("summary-toggle"), summaryTotals: byId("summary-totals"), tabs: byId("thickness-tabs"), toast: byId("status-toast"),
  };
  api.createAppController({
    assetPrefix: window.APP_ASSET_PREFIX || "./",
    clientConfig,
    clientKey,
    html,
    lettersConfig,
    state,
    summaryMode: clientConfig.summaryMode || "count",
    thicknessMeta: clientConfig.thicknessMeta || {},
  }).init();
})();
