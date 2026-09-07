(() => {
  const clientKey = "valeria";
  const clientConfig = window.PEDIDOS_CLIENTS?.[clientKey];

  if (!clientConfig || !window.PedidosApp?.createAppController) {
    console.error("No se pudo iniciar Pedidos Valeria: falta la configuración o el controlador.");
    return;
  }

  const lettersConfig = {
    materialLabel: "MDF 5 mm",
    priceRowLabel: "$ Unit",
    taxRate: 0.21,
    sizes: ["5"],
    quickSteps: [1, 5, 10],
    filters: [{ id: "all", label: "Todas" }],
    letters: [],
  };

  const state = {
    activeThickness: "",
    catalog: [],
    emailSubmissionPending: false,
    familyQuantities: {},
    kitGroupOpenState: {},
    letterState: {
      step: 1,
      filter: "all",
      prices: { "5": 0 },
      quantities: {},
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
    catalogScroll: byId("catalog-scroll"),
    closeDesigns: byId("close-designs"),
    designsModal: byId("designs-modal"),
    emailForm: byId("email-send-form"),
    emailFrame: byId("email-send-target"),
    empty: byId("empty-state"),
    families: byId("families-container"),
    logo: byId("app-logo"),
    openDesigns: byId("open-designs"),
    scrollToBottom: byId("scroll-to-bottom"),
    search: byId("search-input"),
    searchWrapper: byId("search-wrapper"),
    sendButton: byId("send-whatsapp"),
    sendButtonLabel: byId("send-button-label"),
    status: byId("status-message"),
    summaryChevron: byId("summary-chevron"),
    summaryDetailsList: byId("summary-details-list"),
    summaryDetailsPanel: byId("summary-details-panel"),
    summaryTitle: byId("summary-title"),
    summaryToggle: byId("summary-toggle"),
    summaryTotals: byId("summary-totals"),
    tabs: byId("thickness-tabs"),
    toast: byId("status-toast"),
  };

  const hideEmptySummarySections = () => {
    if (!html.summaryTotals) return;

    Array.from(html.summaryTotals.children).forEach((row) => {
      const text = String(row.textContent || "");
      const isGrandTotal = text.includes("Total general");
      const isEmptySection = /\$\s?0[,.]00/.test(text);
      row.classList.toggle("hidden", !isGrandTotal && isEmptySection);
    });
  };

  new MutationObserver(hideEmptySummarySections).observe(html.summaryTotals, {
    childList: true,
    subtree: true,
  });

  window.PedidosApp.createAppController({
    assetPrefix: window.APP_ASSET_PREFIX || "./",
    clientConfig,
    clientKey,
    html,
    lettersConfig,
    state,
    summaryMode: clientConfig.summaryMode || "count",
    thicknessMeta: clientConfig.thicknessMeta || {},
  }).init();
  hideEmptySummarySections();
})();
