(() => {
  const api = window.PedidosApp || {};
  const clientContext = api.createClientContext();
  const state = api.createAppState(clientContext.thicknessMeta, clientContext.lettersConfig);
  const html = api.getDomElements();

  const app = api.createAppController({
    ...clientContext,
    html,
    state,
  });

  app.init();
})();
