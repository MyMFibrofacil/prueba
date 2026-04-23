const DEFAULT_CLIENT_KEY = "rivadavia";
const CLIENTS = window.PEDIDOS_CLIENTS || {};
const DEFAULT_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "\u00d1",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];
const DEFAULT_LETTER_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "vowels", label: "Vocales" },
  { id: "consonants", label: "Consonantes" },
  { id: "loaded", label: "Cargadas" },
];
const LETTER_VOWELS = new Set(["A", "E", "I", "O", "U"]);
const SCROLL_BUTTON_IDLE_MS = 1400;
const textCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function normalizeClientKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "");
}

function detectClientKey() {
  const explicitKey = normalizeClientKey(window.APP_CLIENT_KEY);
  if (explicitKey && CLIENTS[explicitKey]) return explicitKey;

  const params = new URLSearchParams(window.location.search);
  const queryKey = normalizeClientKey(params.get("client") || params.get("cliente"));
  if (queryKey && CLIENTS[queryKey]) return queryKey;

  const segments = window.location.pathname.split("/").filter(Boolean);
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : "";
  const pathKey = lastSegment && !lastSegment.includes(".") ? normalizeClientKey(lastSegment) : "";
  if (pathKey && CLIENTS[pathKey]) return pathKey;

  return DEFAULT_CLIENT_KEY;
}

const clientKey = detectClientKey();
const clientConfig = CLIENTS[clientKey] || CLIENTS[DEFAULT_CLIENT_KEY] || null;
const thicknessMeta = clientConfig?.thicknessMeta || {};
const assetPrefix = window.APP_ASSET_PREFIX || "./";
const summaryMode = clientConfig?.summaryMode || "count";

let catalog = [];
const familyQuantities = {};
const productQuantities = {};
let activeThickness = Object.keys(thicknessMeta)[0] || "3";
let searchTerm = "";
let summaryOpen = false;
let scrollButtonTimer = null;
let statusTimer = null;

const html = {
  logo: document.getElementById("app-logo"),
  tabs: document.getElementById("thickness-tabs"),
  families: document.getElementById("families-container"),
  catalogScroll: document.getElementById("catalog-scroll"),
  scrollToBottom: document.getElementById("scroll-to-bottom"),
  searchWrapper: document.getElementById("search-wrapper"),
  search: document.getElementById("search-input"),
  empty: document.getElementById("empty-state"),
  summaryTotals: document.getElementById("summary-totals"),
  summaryToggle: document.getElementById("summary-toggle"),
  summaryChevron: document.getElementById("summary-chevron"),
  summaryTitle: document.getElementById("summary-title"),
  summaryDetailsPanel: document.getElementById("summary-details-panel"),
  summaryDetailsList: document.getElementById("summary-details-list"),
  sendButton: document.getElementById("send-whatsapp"),
  sendButtonLabel: document.getElementById("send-button-label"),
  status: document.getElementById("status-message"),
};

const lettersConfig = {
  materialLabel: clientConfig?.lettersConfig?.materialLabel || "MDF 5 mm",
  priceRowLabel: clientConfig?.lettersConfig?.priceRowLabel || "$ Unit",
  taxRate: Number.isFinite(Number(clientConfig?.lettersConfig?.taxRate))
    ? Number(clientConfig.lettersConfig.taxRate)
    : 0.21,
  sizes: Array.isArray(clientConfig?.lettersConfig?.sizes) && clientConfig.lettersConfig.sizes.length
    ? clientConfig.lettersConfig.sizes.map((value) => String(value))
    : ["22", "27", "33"],
  quickSteps: Array.isArray(clientConfig?.lettersConfig?.quickSteps) && clientConfig.lettersConfig.quickSteps.length
    ? clientConfig.lettersConfig.quickSteps.map((value) => Number(value)).filter(Number.isFinite)
    : [1, 5, 10],
  filters: Array.isArray(clientConfig?.lettersConfig?.filters) && clientConfig.lettersConfig.filters.length
    ? clientConfig.lettersConfig.filters
    : DEFAULT_LETTER_FILTERS,
  letters: Array.isArray(clientConfig?.lettersConfig?.letters) && clientConfig.lettersConfig.letters.length
    ? clientConfig.lettersConfig.letters.map((value) => String(value))
    : DEFAULT_LETTERS,
};

const letterState = {
  step: lettersConfig.quickSteps[0] || 1,
  filter: lettersConfig.filters[0]?.id || "all",
  prices: Object.fromEntries(lettersConfig.sizes.map((size) => [size, 0])),
  quantities: Object.fromEntries(
    lettersConfig.letters.map((letter) => [
      letter,
      Object.fromEntries(lettersConfig.sizes.map((size) => [size, 0])),
    ])
  ),
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function compareText(a, b) {
  return textCollator.compare(String(a || ""), String(b || ""));
}

function normalizeQty(value) {
  const numeric = Number.parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
}

function getThicknessEntries() {
  return Object.values(thicknessMeta);
}

function getAvailableSections() {
  if (catalog.length > 0) return catalog;
  return getThicknessEntries().map((meta) => ({
    id: meta.id,
    name: meta.label,
    icon: meta.icon,
    type: meta.type || "catalog",
    families: [],
    products: [],
  }));
}

function getThickness(id) {
  return thicknessMeta[id] || {
    id,
    label: id,
    summaryLabel: id,
    messageLabel: id,
    summaryUnit: "placas",
    icon: "inventory_2",
    type: "catalog",
  };
}

function getSectionType(id) {
  const loadedSection = catalog.find((section) => section.id === id);
  if (loadedSection?.type) return loadedSection.type;
  return getThickness(id).type || "catalog";
}

function isLettersSection(id) {
  return getSectionType(id) === "letters";
}

function isPriceListSection(id) {
  return getSectionType(id) === "price-list";
}

function getSectionUnitLabel(sectionId, count = 0) {
  const base = getThickness(sectionId).summaryUnit || "placas";
  if (base === "letras") return count === 1 ? "letra" : "letras";
  return count === 1 ? "placa" : "placas";
}

function formatSectionCount(sectionId, count) {
  return `${count} ${getSectionUnitLabel(sectionId, count)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function applyClientUi() {
  if (!clientConfig) return;

  const ui = clientConfig.ui || {};
  document.title = ui.title || `Pedidos ${clientConfig.name || ""}`.trim() || "Pedidos";

  if (html.search && ui.searchPlaceholder) {
    html.search.placeholder = ui.searchPlaceholder;
  }

  if (html.summaryTitle && ui.detailTitle) {
    html.summaryTitle.textContent = ui.detailTitle;
  }

  if (html.sendButtonLabel && ui.sendButtonLabel) {
    html.sendButtonLabel.textContent = ui.sendButtonLabel;
  }

  if (html.logo && clientConfig.logoPath) {
    html.logo.src = `${assetPrefix}${clientConfig.logoPath}`;
  }
}

function updateSearchVisibility() {
  if (!html.searchWrapper) return;
  html.searchWrapper.classList.toggle("hidden", isLettersSection(activeThickness));
}

function setFamiliesMessage(message) {
  html.families.innerHTML = `<p class="text-sm text-slate-500">${escapeHtml(message)}</p>`;
}

function setStatus(message, tone = "muted") {
  if (!html.status) return;
  if (statusTimer) clearTimeout(statusTimer);

  html.status.textContent = message || "";
  html.status.className = "px-2 text-xs min-h-4";

  if (tone === "success") {
    html.status.classList.add("text-emerald-600");
  } else if (tone === "error") {
    html.status.classList.add("text-red-600");
  } else {
    html.status.classList.add("text-slate-500");
  }

  if (message) {
    statusTimer = setTimeout(() => {
      html.status.textContent = "";
      html.status.className = "px-2 text-xs text-slate-500 min-h-4";
    }, 5000);
  }
}

function getRemainingScroll() {
  if (!html.catalogScroll) return 0;

  const containerIsScrollable = html.catalogScroll.scrollHeight - html.catalogScroll.clientHeight > 1;
  const remainingContainer =
    html.catalogScroll.scrollHeight - html.catalogScroll.scrollTop - html.catalogScroll.clientHeight;
  const remainingWindow =
    Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    ) - (window.scrollY + window.innerHeight);

  return containerIsScrollable ? remainingContainer : remainingWindow;
}

function hideScrollButton() {
  if (!html.scrollToBottom) return;
  html.scrollToBottom.classList.add("hidden");
}

function showScrollButtonTemporarily() {
  if (!html.scrollToBottom) return;
  if (getRemainingScroll() < 24) {
    hideScrollButton();
    return;
  }

  html.scrollToBottom.classList.remove("hidden");
  if (scrollButtonTimer) clearTimeout(scrollButtonTimer);
  scrollButtonTimer = setTimeout(hideScrollButton, SCROLL_BUTTON_IDLE_MS);
}

function getActiveThickness() {
  return catalog.find((section) => section.id === activeThickness);
}

function getFamilyQty(familyId) {
  return familyQuantities[familyId] || 0;
}

function getProductQty(productId) {
  return productQuantities[productId] || 0;
}

function setFamilyQty(familyId, value) {
  const next = normalizeQty(value);
  if (next === 0) {
    delete familyQuantities[familyId];
  } else {
    familyQuantities[familyId] = next;
  }
  render();
}

function updateFamilyQty(familyId, delta) {
  setFamilyQty(familyId, getFamilyQty(familyId) + delta);
}

function setProductQty(productId, value) {
  const next = normalizeQty(value);
  if (next === 0) {
    delete productQuantities[productId];
  } else {
    productQuantities[productId] = next;
  }
  render();
}

function updateProductQty(productId, delta) {
  setProductQty(productId, getProductQty(productId) + delta);
}

function getLetterTotal(letter) {
  return lettersConfig.sizes.reduce(
    (sum, size) => sum + (letterState.quantities[letter]?.[size] || 0),
    0
  );
}

function isNumericLetter(value) {
  return /^\d+$/.test(String(value || ""));
}

function getActiveLetterFilter() {
  return (
    lettersConfig.filters.find((filter) => filter.id === letterState.filter) ||
    lettersConfig.filters[0] ||
    null
  );
}

function getActiveLetterFilterMode() {
  return getActiveLetterFilter()?.mode || getActiveLetterFilter()?.id || "letters";
}

function getActiveLetterFilterLabel(count) {
  const mode = getActiveLetterFilterMode();
  if (mode === "numbers") return count === 1 ? "número" : "números";
  if (mode === "letters") return count === 1 ? "letra" : "letras";
  return count === 1 ? "carácter" : "caracteres";
}

function getFilteredLetters() {
  return lettersConfig.letters.filter((letter) => {
    const activeFilterMode = getActiveLetterFilterMode();
    if (activeFilterMode === "numbers") return isNumericLetter(letter);
    if (activeFilterMode === "letters") return !isNumericLetter(letter);
    if (letterState.filter === "vowels") return LETTER_VOWELS.has(letter);
    if (letterState.filter === "consonants") return !LETTER_VOWELS.has(letter);
    if (letterState.filter === "loaded") return getLetterTotal(letter) > 0;
    return true;
  });
}

function setLetterQty(letter, size, value) {
  if (!letterState.quantities[letter]) {
    letterState.quantities[letter] = {};
  }
  letterState.quantities[letter][size] = normalizeQty(value);
  render();
}

function updateLetterQty(letter, size, delta) {
  const current = letterState.quantities[letter]?.[size] || 0;
  setLetterQty(letter, size, Math.max(0, current + delta));
}

function clearLoadedLetters() {
  lettersConfig.letters.forEach((letter) => {
    if (getLetterTotal(letter) <= 0) return;
    lettersConfig.sizes.forEach((size) => {
      letterState.quantities[letter][size] = 0;
    });
  });
  setStatus("Se limpiaron los caracteres cargados.");
  render();
}

function clearAllLetters() {
  lettersConfig.letters.forEach((letter) => {
    lettersConfig.sizes.forEach((size) => {
      letterState.quantities[letter][size] = 0;
    });
  });
  setStatus("Se limpiaron todos los caracteres.");
  render();
}

function summarizeLettersSection() {
  const lines = lettersConfig.letters
    .map((letter) => {
      const perSize = lettersConfig.sizes
        .map((size) => ({
          size,
          qty: letterState.quantities[letter]?.[size] || 0,
          unitPrice: letterState.prices[size] || 0,
        }))
        .filter((item) => item.qty > 0);

      if (perSize.length === 0) return null;

      return {
        letter,
        perSize,
        total: perSize.reduce((sum, item) => sum + item.qty, 0),
        subtotal: perSize.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
      };
    })
    .filter(Boolean);

  const sizeTotals = Object.fromEntries(
    lettersConfig.sizes.map((size) => [
      size,
      lettersConfig.letters.reduce(
        (sum, letter) => sum + (letterState.quantities[letter]?.[size] || 0),
        0
      ),
    ])
  );

  const sizeSubtotals = Object.fromEntries(
    lettersConfig.sizes.map((size) => [
      size,
      (letterState.prices[size] || 0) * (sizeTotals[size] || 0),
    ])
  );

  const subtotal = Object.values(sizeSubtotals).reduce((sum, value) => sum + value, 0);
  const tax = subtotal * lettersConfig.taxRate;

  return {
    lines,
    sizeTotals,
    sizeSubtotals,
    total: Object.values(sizeTotals).reduce((sum, qty) => sum + qty, 0),
    subtotal,
    tax,
    totalWithTax: subtotal + tax,
  };
}

function toggleFamily(familyId) {
  const section = getActiveThickness();
  if (!section || isLettersSection(section.id)) return;
  const family = section.families.find((item) => item.id === familyId);
  if (!family) return;
  family.open = !family.open;
  renderFamilies();
}

function renderTabs() {
  html.tabs.innerHTML = getAvailableSections()
    .map((section) => {
      const active = section.id === activeThickness;
      return `
        <button
          data-thickness="${escapeHtml(section.id)}"
          class="flex flex-col items-center min-w-[88px] justify-center border-b-[3px] ${
            active ? "border-primary text-primary" : "border-transparent text-slate-500"
          } gap-1 pb-2 pt-3"
        >
          <span class="material-symbols-outlined">${escapeHtml(section.icon)}</span>
          <p class="text-xs ${active ? "font-bold" : "font-medium"} whitespace-nowrap">${escapeHtml(section.name)}</p>
        </button>
      `;
    })
    .join("");
}

function searchMatchesFamily(family) {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  if (family.name.toLowerCase().includes(term)) return true;
  return family.products.some((product) => product.name.toLowerCase().includes(term));
}

function filteredProductsForFamily(family) {
  if (!searchTerm) return family.products;
  const term = searchTerm.toLowerCase();
  return family.products.filter((product) => {
    return family.name.toLowerCase().includes(term) || product.name.toLowerCase().includes(term);
  });
}

function renderGroupFamilyDetails(family, products) {
  const familyQty = getFamilyQty(family.id);
  const familyBase = family.products.reduce((total, product) => total + product.plates, 0);

  return `
    <div class="px-4 pb-4 space-y-3">
      <div class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Placas por familia</p>
        <p class="text-sm font-semibold text-slate-800">${familyBase} placas</p>
        ${
          familyQty > 0
            ? `<p class="text-xs text-primary font-semibold mt-1">Pedido actual: ${familyBase * familyQty} placas</p>`
            : ""
        }
      </div>
      <div class="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
        ${products
          .map((product) => {
            const total = familyQty * product.plates;
            return `
              <div class="p-3 flex items-start justify-between gap-3 bg-white">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-slate-800 break-words">${escapeHtml(product.name)}</p>
                  <p class="text-xs text-slate-500">Base: ${product.plates} placas</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold text-primary">${total > 0 ? `${total} placas` : "-"}</p>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderIndividualProductRow(product) {
  const qty = getProductQty(product.id);

  return `
    <div class="p-4 flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-semibold text-slate-800 break-words whitespace-normal leading-snug">${escapeHtml(product.name)}</h4>
      </div>
      <div class="flex shrink-0 items-center bg-slate-100 rounded-lg p-1">
        <button
          data-product-action="minus"
          data-product="${escapeHtml(product.id)}"
          class="size-8 flex items-center justify-center rounded-md bg-white shadow-sm text-primary"
        >
          <span class="material-symbols-outlined text-lg">remove</span>
        </button>
        <input
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          value="${qty}"
          data-product-input="${escapeHtml(product.id)}"
          class="w-12 h-8 text-center font-bold text-sm border-0 bg-transparent focus:ring-0 px-1"
        />
        <button
          data-product-action="plus"
          data-product="${escapeHtml(product.id)}"
          class="size-8 flex items-center justify-center rounded-md ${
            qty > 0 ? "bg-primary text-white" : "bg-white text-primary"
          } shadow-sm"
        >
          <span class="material-symbols-outlined text-lg">add</span>
        </button>
      </div>
    </div>
  `;
}

function renderFamilyCard(family) {
  const filteredProducts = filteredProductsForFamily(family);
  if (searchTerm && filteredProducts.length === 0 && !searchMatchesFamily(family)) return "";

  const products = family.type === "grupo" && searchTerm ? family.products : filteredProducts;
  const isOpen = searchTerm ? true : family.open;
  const familyQty = getFamilyQty(family.id);
  const familyBase = family.products.reduce((total, product) => total + product.plates, 0);
  const familyTotal =
    family.type === "grupo"
      ? familyBase * familyQty
      : products.reduce((sum, product) => sum + getProductQty(product.id), 0);

  return `
    <section class="rounded-xl overflow-hidden border border-slate-200 bg-white">
      <div class="p-4 flex items-start gap-3">
        <button
          data-family="${escapeHtml(family.id)}"
          class="flex-1 min-w-0 flex items-start gap-3 text-left"
          type="button"
        >
          <span class="material-symbols-outlined text-primary mt-0.5">${isOpen ? "folder_open" : "folder"}</span>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-bold text-slate-800">${escapeHtml(family.name)}</p>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              ${
                family.type === "grupo"
                  ? `${family.products.length} productos · ${familyBase} placas por familia`
                  : `${family.products.length} producto${family.products.length === 1 ? "" : "s"}`
              }
            </p>
            ${
              familyTotal > 0
                ? `<p class="text-xs text-primary font-semibold mt-1">Pedido actual: ${familyTotal} placas</p>`
                : ""
            }
          </div>
        </button>
        ${
          family.type === "grupo"
            ? `
              <div class="flex shrink-0 items-center bg-slate-100 rounded-lg p-1">
                <button
                  data-family-action="minus"
                  data-family-qty="${escapeHtml(family.id)}"
                  class="size-8 flex items-center justify-center rounded-md bg-white shadow-sm text-primary"
                  type="button"
                >
                  <span class="material-symbols-outlined text-lg">remove</span>
                </button>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  value="${familyQty}"
                  data-family-input="${escapeHtml(family.id)}"
                  class="w-12 h-8 text-center font-bold text-sm border-0 bg-transparent focus:ring-0 px-1"
                />
                <button
                  data-family-action="plus"
                  data-family-qty="${escapeHtml(family.id)}"
                  class="size-8 flex items-center justify-center rounded-md ${
                    familyQty > 0 ? "bg-primary text-white" : "bg-white text-primary"
                  } shadow-sm"
                  type="button"
                >
                  <span class="material-symbols-outlined text-lg">add</span>
                </button>
              </div>
            `
            : ""
        }
      </div>
      ${
        isOpen
          ? family.type === "grupo"
            ? renderGroupFamilyDetails(family, products)
            : `<div class="divide-y divide-slate-100">${products.map((product) => renderIndividualProductRow(product)).join("")}</div>`
          : ""
      }
    </section>
  `;
}

function renderLettersSection() {
  const filteredLetters = getFilteredLetters();
  const activeFilterLabel = getActiveLetterFilterLabel(filteredLetters.length);

  const steps = lettersConfig.quickSteps
    .map((step) => {
      const active = step === letterState.step;
      return `
        <button
          type="button"
          data-letter-step="${escapeHtml(step)}"
          class="shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${
            active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
          }"
        >
          ${escapeHtml(step)} en ${escapeHtml(step)}
        </button>
      `;
    })
    .join("");

  const filters = lettersConfig.filters
    .map((filter) => {
      const active = filter.id === letterState.filter;
      return `
        <button
          type="button"
          data-letter-filter="${escapeHtml(filter.id)}"
          class="shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${
            active ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-700"
          }"
        >
          ${escapeHtml(filter.label)}
        </button>
      `;
    })
    .join("");

  const cards =
    filteredLetters.length > 0
      ? filteredLetters
          .map((letter) => {
            const total = getLetterTotal(letter);
            return `
              <article class="rounded-3xl border ${
                total > 0 ? "border-primary/25 bg-white" : "border-slate-200 bg-white"
              } p-2 shadow-sm">
                <div class="mb-2 flex items-start justify-between gap-1">
                  <h3 class="text-[1.7rem] font-extrabold leading-none text-slate-900">${escapeHtml(letter)}</h3>
                  <span class="min-w-7 rounded-full px-2 py-0.5 text-center text-[10px] font-extrabold ${
                    total > 0 ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"
                  }">${total}</span>
                </div>
                <div class="space-y-1.5">
                  ${lettersConfig.sizes
                    .map((size) => {
                      const qty = letterState.quantities[letter]?.[size] || 0;
                      return `
                        <div class="rounded-2xl bg-slate-50 px-1 py-1">
                          <div class="grid grid-cols-[0.9rem_1.5rem_minmax(0,1fr)_1.5rem] items-center gap-0.5">
                            <span class="text-[9px] font-extrabold text-slate-500">${escapeHtml(size)}</span>
                            <button
                              type="button"
                              data-letter-action="decrease"
                              data-letter="${escapeHtml(letter)}"
                              data-letter-size="${escapeHtml(size)}"
                              class="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm active:scale-95"
                            >
                              <span class="material-symbols-outlined text-[15px]">remove</span>
                            </button>
                            <input
                              type="number"
                              min="0"
                              inputmode="numeric"
                              value="${qty}"
                              data-letter-input="${escapeHtml(letter)}"
                              data-letter-size="${escapeHtml(size)}"
                              class="h-6 min-w-0 w-full rounded-lg border-0 bg-white px-0 text-center text-[11px] font-extrabold text-slate-900 focus:ring-0"
                            />
                            <button
                              type="button"
                              data-letter-action="increase"
                              data-letter="${escapeHtml(letter)}"
                              data-letter-size="${escapeHtml(size)}"
                              class="flex h-6 w-6 items-center justify-center rounded-lg ${
                                qty > 0 ? "bg-primary text-white" : "bg-white text-primary"
                              } shadow-sm active:scale-95"
                            >
                              <span class="material-symbols-outlined text-[15px]">add</span>
                            </button>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </article>
            `;
          })
          .join("")
      : `
        <div class="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No hay ${escapeHtml(getActiveLetterFilterLabel(2))} en esta vista.
        </div>
      `;

  html.families.innerHTML = `
    <section class="space-y-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Carga rapida</p>
            <p class="text-sm font-semibold text-slate-800">${escapeHtml(lettersConfig.materialLabel)}</p>
          </div>
          <p class="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Paso ${escapeHtml(letterState.step)}
          </p>
        </div>
        <div class="flex gap-2 overflow-x-auto scrollbar-hide">${steps}</div>
        <div class="flex gap-2 overflow-x-auto scrollbar-hide">${filters}</div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-letter-clear="loaded"
            class="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"
          >
            Limpiar cargadas
          </button>
          <button
            type="button"
            data-letter-clear="all"
            class="rounded-2xl bg-primary px-3 py-2.5 text-xs font-bold text-white"
          >
            Limpiar todo
          </button>
        </div>
      </div>
      <div class="flex items-center justify-between gap-3 px-1">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Grilla movil</p>
          <p class="text-xs font-semibold text-slate-700">3 por fila con 22, 27 y 33 mm</p>
        </div>
        <p class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
          ${filteredLetters.length} ${escapeHtml(activeFilterLabel)}
        </p>
      </div>
      <div class="grid grid-cols-3 gap-2">${cards}</div>
    </section>
  `;

  html.empty.classList.add("hidden");
}

function renderPriceListSection(section) {
  const filteredProducts = section.products.filter((product) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      product.name.toLowerCase().includes(term) ||
      String(product.material || "").toLowerCase().includes(term)
    );
  });

  if (filteredProducts.length === 0) {
    html.families.innerHTML = "";
    html.empty.classList.remove("hidden");
    return;
  }

  html.families.innerHTML = `
    <section class="space-y-3">
      <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Categoria</p>
        <p class="mt-1 text-sm font-semibold text-slate-800">${escapeHtml(section.name)}</p>
      </div>
      <div class="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
        ${filteredProducts
          .map((product) => {
            const qty = getProductQty(product.id);
            const subtotal = qty * product.unitPrice;
            return `
              <div class="p-4 flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-800 break-words">${escapeHtml(product.name)}</p>
                  <p class="mt-1 text-xs text-slate-500">${escapeHtml(formatCurrency(product.unitPrice))}</p>
                  ${
                    subtotal > 0
                      ? `<p class="mt-1 text-xs font-semibold text-primary">${escapeHtml(formatCurrency(subtotal))}</p>`
                      : ""
                  }
                </div>
                <div class="flex shrink-0 items-center bg-slate-100 rounded-lg p-1">
                  <button
                    data-product-action="minus"
                    data-product="${escapeHtml(product.id)}"
                    class="size-8 flex items-center justify-center rounded-md bg-white shadow-sm text-primary"
                    type="button"
                  >
                    <span class="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    value="${qty}"
                    data-product-input="${escapeHtml(product.id)}"
                    class="w-12 h-8 text-center font-bold text-sm border-0 bg-transparent focus:ring-0 px-1"
                  />
                  <button
                    data-product-action="plus"
                    data-product="${escapeHtml(product.id)}"
                    class="size-8 flex items-center justify-center rounded-md ${
                      qty > 0 ? "bg-primary text-white" : "bg-white text-primary"
                    } shadow-sm"
                    type="button"
                  >
                    <span class="material-symbols-outlined text-lg">add</span>
                  </button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
  html.empty.classList.add("hidden");
}

function renderFamilies() {
  const section = getActiveThickness();
  if (!section) {
    html.families.innerHTML = "";
    html.empty.classList.add("hidden");
    return;
  }

  if (isLettersSection(section.id)) {
    renderLettersSection();
    return;
  }

  if (section.type === "price-list") {
    renderPriceListSection(section);
    return;
  }

  const cards = section.families.map(renderFamilyCard).filter(Boolean).join("");
  html.families.innerHTML = cards;
  html.empty.classList.toggle("hidden", Boolean(cards));
}

function summary() {
  const sections = [];
  let totalCount = 0;
  let totalValue = 0;
  const totalsByThickness = Object.fromEntries(
    getAvailableSections().map((meta) => [meta.id, 0])
  );
  const totalsByValue = Object.fromEntries(
    getAvailableSections().map((meta) => [meta.id, 0])
  );

  catalog.forEach((section) => {
    if (isLettersSection(section.id)) {
      const lettersSummary = summarizeLettersSection();
      if (lettersSummary.total > 0) {
        totalsByThickness[section.id] = lettersSummary.total;
        totalsByValue[section.id] = lettersSummary.totalWithTax;
        totalCount += lettersSummary.total;
        totalValue += lettersSummary.totalWithTax;
        sections.push({
          id: section.id,
          name: section.name,
          type: "letters",
          totalCount: lettersSummary.total,
          sizeTotals: lettersSummary.sizeTotals,
          sizeSubtotals: lettersSummary.sizeSubtotals,
          subtotal: lettersSummary.subtotal,
          tax: lettersSummary.tax,
          totalWithTax: lettersSummary.totalWithTax,
          letters: lettersSummary.lines,
        });
      }
      return;
    }

    if (section.type === "price-list") {
      const selectedProducts = section.products
        .map((product) => ({
          ...product,
          qty: getProductQty(product.id),
        }))
        .filter((product) => product.qty > 0);

      if (selectedProducts.length === 0) return;

      const quantity = selectedProducts.reduce((sum, product) => sum + product.qty, 0);
      const subtotal = selectedProducts.reduce((sum, product) => sum + product.qty * product.unitPrice, 0);
      const tax = subtotal * lettersConfig.taxRate;
      const totalWithTax = subtotal + tax;

      totalsByThickness[section.id] = quantity;
      totalsByValue[section.id] = totalWithTax;
      totalCount += quantity;
      totalValue += totalWithTax;

      sections.push({
        id: section.id,
        name: section.name,
        type: "price-list",
        totalCount: quantity,
        subtotal,
        tax,
        totalWithTax,
        products: selectedProducts.map((product) => ({
          ...product,
          subtotal: product.qty * product.unitPrice,
        })),
      });
      return;
    }

    const families = [];
    let sectionTotal = 0;

    section.families.forEach((family) => {
      if (family.type === "grupo") {
        const qty = getFamilyQty(family.id);
        if (qty <= 0) return;

        const breakdown = family.products.map((product) => ({
          name: product.name,
          basePlates: product.plates,
          totalPlates: product.plates * qty,
        }));
        const familyTotal = breakdown.reduce((sum, item) => sum + item.totalPlates, 0);
        totalCount += familyTotal;
        sectionTotal += familyTotal;

        families.push({
          type: "grupo",
          name: family.name,
          multiplier: qty,
          totalPlates: familyTotal,
          breakdown,
        });
        return;
      }

      const selectedProducts = family.products
        .map((product) => ({
          name: product.name,
          sourceFamily: product.sourceFamily || family.name,
          qty: getProductQty(product.id),
        }))
        .filter((product) => product.qty > 0);

      if (selectedProducts.length === 0) return;

      const familyTotal = selectedProducts.reduce((sum, product) => sum + product.qty, 0);
      totalCount += familyTotal;
      sectionTotal += familyTotal;

      families.push({
        type: "individual",
        name: family.name,
        totalPlates: familyTotal,
        breakdown: selectedProducts.map((product) => ({
          name:
            product.sourceFamily && product.sourceFamily !== family.name
              ? `${product.sourceFamily} - ${product.name}`
              : product.name,
          totalPlates: product.qty,
        })),
      });
    });

    if (families.length > 0) {
      totalsByThickness[section.id] = sectionTotal;
      sections.push({
        id: section.id,
        name: section.name,
        type: "catalog",
        totalCount: sectionTotal,
        families,
      });
    }
  });

  return {
    sections,
    totalCount,
    totalValue,
    totalsByThickness,
    totalsByValue,
  };
}

function renderSummary() {
  const data = summary();

  if (html.summaryTotals) {
    html.summaryTotals.innerHTML = getAvailableSections()
      .map((section) => {
        const count = data.totalsByThickness[section.id] || 0;
        const value = data.totalsByValue[section.id] || 0;
        const renderedValue =
          summaryMode === "value"
            ? formatCurrency(value)
            : formatSectionCount(section.id, count);
        return `
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-bold text-slate-700">Total ${escapeHtml(section.summaryLabel || section.name || getThickness(section.id).summaryLabel || getThickness(section.id).label)}:</p>
            <p class="text-sm font-bold text-slate-700 shrink-0">${escapeHtml(renderedValue)}</p>
          </div>
        `;
      })
      .join("");
  }

  html.sendButton.disabled = data.totalCount === 0;

  if (data.sections.length === 0) {
    html.summaryDetailsList.innerHTML =
      '<p class="p-4 text-sm text-slate-500">Todavia no agregaste items al pedido.</p>';
    summaryOpen = false;
  } else {
    html.summaryDetailsList.innerHTML = data.sections
      .map((section) => {
        if (section.type === "letters") {
          return `
            <div class="border-b border-slate-200 last:border-b-0">
              <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(section.name)}</p>
              </div>
              <div class="p-4 space-y-3">
                <div class="grid grid-cols-4 gap-2">
                  ${lettersConfig.sizes
                    .map((size) => {
                      const total = section.sizeTotals[size] || 0;
                      const subtotal = section.sizeSubtotals[size] || 0;
                      return `
                        <div class="rounded-lg bg-slate-50 px-3 py-2 text-center">
                          <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${escapeHtml(size)}</p>
                          <p class="mt-1 text-sm font-bold text-slate-800">${total}</p>
                          <p class="mt-1 text-[11px] text-slate-500">${escapeHtml(formatCurrency(subtotal))}</p>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
                <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-2">
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <p class="font-semibold text-slate-600">Subtotal</p>
                    <p class="font-bold text-slate-800">${escapeHtml(formatCurrency(section.subtotal))}</p>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <p class="font-semibold text-slate-600">IVA</p>
                    <p class="font-bold text-slate-800">${escapeHtml(formatCurrency(section.tax))}</p>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <p class="font-bold text-primary">Total con IVA</p>
                    <p class="font-bold text-primary">${escapeHtml(formatCurrency(section.totalWithTax))}</p>
                  </div>
                </div>
                <div class="space-y-1">
                  ${section.letters
                    .map((line) => {
                      const detail = line.perSize
                        .map((item) => `${item.size}mm: ${item.qty}`)
                        .join(" | ");
                      return `
                        <div class="flex items-start justify-between gap-3 text-xs">
                          <p class="font-semibold text-slate-800">${escapeHtml(line.letter)}</p>
                          <div class="text-right">
                            <p class="text-slate-500">${escapeHtml(detail)}</p>
                            <p class="mt-0.5 font-semibold text-slate-700">${escapeHtml(formatCurrency(line.subtotal))}</p>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            </div>
          `;
        }

        if (section.type === "price-list") {
          return `
            <div class="border-b border-slate-200 last:border-b-0">
              <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(section.name)}</p>
              </div>
              <div class="p-4 space-y-3">
                <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-2">
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <p class="font-semibold text-slate-600">Subtotal</p>
                    <p class="font-bold text-slate-800">${escapeHtml(formatCurrency(section.subtotal))}</p>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <p class="font-semibold text-slate-600">IVA</p>
                    <p class="font-bold text-slate-800">${escapeHtml(formatCurrency(section.tax))}</p>
                  </div>
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <p class="font-bold text-primary">Total con IVA</p>
                    <p class="font-bold text-primary">${escapeHtml(formatCurrency(section.totalWithTax))}</p>
                  </div>
                </div>
                <div class="space-y-1">
                  ${section.products
                    .map((product) => {
                      return `
                        <div class="flex items-start justify-between gap-3 text-xs">
                          <div class="min-w-0">
                            <p class="font-semibold text-slate-800">${escapeHtml(product.name)}</p>
                            <p class="text-slate-500">${product.qty} x ${escapeHtml(formatCurrency(product.unitPrice))}</p>
                          </div>
                          <p class="font-semibold text-slate-700 shrink-0">${escapeHtml(formatCurrency(product.subtotal))}</p>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            </div>
          `;
        }

        return `
          <div class="border-b border-slate-200 last:border-b-0">
            <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(section.name)}</p>
            </div>
            <div class="divide-y divide-slate-100">
              ${section.families
                .map((family) => {
                  const multiplierLabel =
                    family.type === "grupo"
                      ? `<p class="text-xs text-slate-500">${family.multiplier}x familia</p>`
                      : "";

                  return `
                    <div class="p-4 space-y-2">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-semibold text-slate-800">${escapeHtml(family.name)}</p>
                          ${multiplierLabel}
                        </div>
                        <p class="text-sm font-bold text-primary shrink-0">${formatSectionCount(section.id, family.totalPlates)}</p>
                      </div>
                      <div class="space-y-1">
                        ${family.breakdown
                          .map((item) => {
                            return `
                              <div class="flex items-start justify-between gap-3 text-xs">
                                <p class="text-slate-500 min-w-0">${escapeHtml(item.name)}</p>
                                <p class="text-slate-700 shrink-0">${item.totalPlates}</p>
                              </div>
                            `;
                          })
                          .join("")}
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  html.summaryDetailsPanel.classList.toggle("hidden", !summaryOpen);
  html.summaryChevron.style.transform = summaryOpen ? "rotate(0deg)" : "rotate(180deg)";
}

function buildWhatsAppText() {
  const data = summary();
  const lines = ["Hola, comparto el siguiente pedido:"];

  data.sections.forEach((section) => {
    const sectionMeta = getThickness(section.id);
    const sectionLabel =
      section.type === "price-list"
        ? section.name
        : sectionMeta.messageLabel || sectionMeta.summaryLabel || section.name;
    lines.push("");
    lines.push(`*${sectionLabel}*`);

    if (section.type === "letters") {
      section.letters.forEach((line) => {
        const detail = line.perSize
          .map((item) => `${item.size}mm x${item.qty}`)
          .join(" | ");
        lines.push(`- ${line.letter}: ${detail} = ${formatCurrency(line.subtotal)}`);
      });
      lines.push(`Subtotal: ${formatCurrency(section.subtotal)}`);
      lines.push(`IVA: ${formatCurrency(section.tax)}`);
      lines.push(`Total con IVA: ${formatCurrency(section.totalWithTax)}`);
      lines.push(`*Total ${sectionMeta.summaryLabel}: ${formatSectionCount(section.id, section.totalCount)}*`);
      return;
    }

    if (section.type === "price-list") {
      section.products.forEach((product) => {
        lines.push(`- ${product.name}: ${product.qty} x ${formatCurrency(product.unitPrice)} = ${formatCurrency(product.subtotal)}`);
      });
      lines.push(`Subtotal: ${formatCurrency(section.subtotal)}`);
      lines.push(`IVA: ${formatCurrency(section.tax)}`);
      lines.push(`Total con IVA: ${formatCurrency(section.totalWithTax)}`);
      lines.push(`*Total ${section.name}: ${formatCurrency(section.totalWithTax)}*`);
      return;
    }

    section.families.forEach((family, index) => {
      if (family.type === "grupo") {
        const copiesLabel = family.multiplier === 1 ? "1 copia" : `${family.multiplier} copias`;
        lines.push(`${family.name} (${copiesLabel})`);
      } else {
        lines.push(`${family.name}`);
      }

      family.breakdown.forEach((item) => {
        lines.push(`- ${item.name}: ${item.totalPlates} placas`);
      });

      if (index < section.families.length - 1) {
        lines.push("");
      }
    });

    lines.push(`*Total ${sectionMeta.summaryLabel}: ${formatSectionCount(section.id, section.totalCount)}*`);
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_error) {
    // Fallback below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_error) {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

async function sendToWhatsApp() {
  const text = buildWhatsAppText();
  const copied = await copyText(text);
  const encodedText = encodeURIComponent(text);
  const deepLink = `whatsapp://send?text=${encodedText}`;
  const webLink = `https://api.whatsapp.com/send?text=${encodedText}`;

  window.open(deepLink, "_blank");
  setTimeout(() => {
    window.open(webLink, "_blank");
  }, 400);

  if (copied) {
    setStatus("Pedido copiado. Elegi el grupo en WhatsApp y envia el mensaje.", "success");
  } else {
    setStatus("WhatsApp se abrio con el pedido. Si no aparece el texto, copialo desde el resumen.", "error");
  }
}

function bindEvents() {
  html.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-thickness]");
    if (!button) return;
    activeThickness = button.dataset.thickness;
    render();
  });

  html.families.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-family]");
    if (toggleButton) {
      toggleFamily(toggleButton.dataset.family);
      return;
    }

    const familyQtyButton = event.target.closest("[data-family-action][data-family-qty]");
    if (familyQtyButton) {
      const delta = familyQtyButton.dataset.familyAction === "plus" ? 1 : -1;
      updateFamilyQty(familyQtyButton.dataset.familyQty, delta);
      return;
    }

    const productQtyButton = event.target.closest("[data-product-action][data-product]");
    if (productQtyButton) {
      const delta = productQtyButton.dataset.productAction === "plus" ? 1 : -1;
      updateProductQty(productQtyButton.dataset.product, delta);
      return;
    }

    const letterStepButton = event.target.closest("[data-letter-step]");
    if (letterStepButton) {
      letterState.step = Number(letterStepButton.dataset.letterStep);
      render();
      return;
    }

    const letterFilterButton = event.target.closest("[data-letter-filter]");
    if (letterFilterButton) {
      letterState.filter = letterFilterButton.dataset.letterFilter;
      render();
      return;
    }

    const letterActionButton = event.target.closest("[data-letter-action][data-letter][data-letter-size]");
    if (letterActionButton) {
      const { letterAction, letter, letterSize } = letterActionButton.dataset;
      if (letterAction === "increase") updateLetterQty(letter, letterSize, letterState.step);
      if (letterAction === "decrease") updateLetterQty(letter, letterSize, -letterState.step);
      return;
    }

    const clearLettersButton = event.target.closest("[data-letter-clear]");
    if (clearLettersButton) {
      if (clearLettersButton.dataset.letterClear === "loaded") {
        clearLoadedLetters();
      } else {
        clearAllLetters();
      }
    }
  });

  html.families.addEventListener("change", (event) => {
    const familyInput = event.target.closest("[data-family-input]");
    if (familyInput) {
      setFamilyQty(familyInput.dataset.familyInput, familyInput.value);
      return;
    }

    const productInput = event.target.closest("[data-product-input]");
    if (productInput) {
      setProductQty(productInput.dataset.productInput, productInput.value);
      return;
    }

    const letterInput = event.target.closest("[data-letter-input][data-letter-size]");
    if (letterInput) {
      setLetterQty(letterInput.dataset.letterInput, letterInput.dataset.letterSize, letterInput.value);
    }
  });

  html.search.addEventListener("input", (event) => {
    searchTerm = event.target.value.trim();
    renderFamilies();
  });

  html.summaryToggle.addEventListener("click", () => {
    summaryOpen = !summaryOpen;
    renderSummary();
  });

  html.sendButton.addEventListener("click", sendToWhatsApp);

  if (html.scrollToBottom && html.catalogScroll) {
    html.scrollToBottom.addEventListener("click", () => {
      html.catalogScroll.scrollTo({
        top: html.catalogScroll.scrollHeight,
        behavior: "smooth",
      });

      if (html.sendButton) {
        html.sendButton.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });

    html.catalogScroll.addEventListener("scroll", showScrollButtonTemporarily, { passive: true });
    window.addEventListener("scroll", showScrollButtonTemporarily, { passive: true });
    window.addEventListener(
      "resize",
      () => {
        if (getRemainingScroll() < 24) hideScrollButton();
      },
      { passive: true }
    );
    hideScrollButton();
  }
}

async function loadCatalogFromSheet() {
  if (!clientConfig) {
    throw new Error("Cliente no configurado");
  }

  let data = { table: { cols: [], rows: [] } };
  const hasSheet = Boolean(clientConfig.sheetId) && clientConfig.sheetGid !== undefined;

  if (hasSheet) {
    const url = `https://docs.google.com/spreadsheets/d/${clientConfig.sheetId}/gviz/tq?tqx=out:json&gid=${clientConfig.sheetGid}`;

    const parseSheetResponseText = (rawText) => {
      const match = rawText.match(/google\.visualization\.Query\.setResponse\((.*)\);?\s*$/s);
      if (!match) {
        throw new Error("Formato de respuesta de Google Sheets no reconocido");
      }
      return JSON.parse(match[1]);
    };

    const loadWithFetch = async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`No se pudo leer la hoja (${response.status})`);
      }
      return parseSheetResponseText(await response.text());
    };

    const loadWithScript = () =>
      new Promise((resolve, reject) => {
        const previousGoogle = window.google;
        const previousSetResponse = window.google?.visualization?.Query?.setResponse;
        let settled = false;

        const cleanup = (scriptNode) => {
          if (scriptNode?.parentNode) scriptNode.parentNode.removeChild(scriptNode);
          if (window.google?.visualization?.Query) {
            window.google.visualization.Query.setResponse = previousSetResponse;
          }
        };

        window.google = window.google || {};
        window.google.visualization = window.google.visualization || {};
        window.google.visualization.Query = window.google.visualization.Query || {};
        window.google.visualization.Query.setResponse = (payload) => {
          if (settled) return;
          settled = true;
          cleanup(script);
          resolve(payload);
        };

        const script = document.createElement("script");
        script.src = `${url}&_ts=${Date.now()}`;
        script.async = true;
        script.onerror = () => {
          if (settled) return;
          settled = true;
          cleanup(script);
          if (!previousGoogle) delete window.google;
          reject(new Error("No se pudo cargar la hoja por script"));
        };

        document.head.appendChild(script);

        setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup(script);
          if (!previousGoogle) delete window.google;
          reject(new Error("Tiempo de espera agotado al cargar la hoja"));
        }, 12000);
      });

    try {
      data = await loadWithFetch();
    } catch (_error) {
      data = await loadWithScript();
    }
  }

  const cols = data?.table?.cols || [];
  const rows = data?.table?.rows || [];
  const indexes = Object.fromEntries(cols.map((col, index) => [col.label, index]));

  const getRaw = (cells, label) => {
    const index = indexes[label];
    if (index === undefined) return "";
    const cell = cells[index];
    if (!cell || cell.v === null || cell.v === undefined) return "";
    return cell.v;
  };

  const letterPriceRow = rows.find((row) => {
    const firstCell = row?.c?.[0];
    return String(firstCell?.v || "").trim() === lettersConfig.priceRowLabel;
  });

  if (letterPriceRow) {
    lettersConfig.sizes.forEach((size, index) => {
      const rawValue = letterPriceRow.c?.[index + 1]?.v;
      const numeric = Number(rawValue);
      letterState.prices[size] = Number.isFinite(numeric) ? numeric : 0;
    });
  }

  if (clientConfig?.catalogMode === "price-list") {
    const sections = [];
    const fixedSections = getThicknessEntries().map((meta) => ({
      id: meta.id,
      name: meta.label,
      summaryLabel: meta.summaryLabel || meta.label,
      icon: meta.icon,
      type: meta.type || "catalog",
      families: [],
      products: [],
    }));

    sections.push(...fixedSections);

    const materialsMap = new Map();

    rows.forEach((row, rowIndex) => {
      const cells = row.c || [];
      const productName = String(cells[7]?.v || "").trim();
      const material = String(cells[8]?.v || "").trim();
      const unitPrice = Number(cells[10]?.v);

      if (!productName || !material || !Number.isFinite(unitPrice)) {
        return;
      }

      const sectionId = `mat-${slugify(material)}`;
      if (!materialsMap.has(sectionId)) {
        materialsMap.set(sectionId, {
          id: sectionId,
          name: material,
          summaryLabel: material,
          icon: "inventory_2",
          type: "price-list",
          families: [],
          products: [],
        });
      }

      materialsMap.get(sectionId).products.push({
        id: `prd-${sectionId}-${slugify(productName)}-${rowIndex}`,
        name: productName,
        material,
        unitPrice,
        sortIndex: rowIndex,
      });
    });

    sections.push(
      ...Array.from(materialsMap.values())
        .map((section) => ({
          ...section,
          products: section.products.sort(
            (a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)
          ),
        }))
        .sort((a, b) => compareText(a.name, b.name))
    );

    return sections.filter((section) => section.type === "letters" || section.products.length > 0);
  }

  const sectionsMap = new Map(
    getThicknessEntries().map((meta) => [
      meta.id,
      {
        id: meta.id,
        name: meta.label,
        icon: meta.icon,
        type: getSectionType(meta.id),
        familiesMap: new Map(),
      },
    ])
  );

  rows.forEach((row, rowIndex) => {
    const cells = row.c || [];
    const familyName = String(getRaw(cells, "Familia") || "").trim();
    const productName = String(getRaw(cells, "Producto") || "").trim();
    const rawPlates = getRaw(cells, "placas");
    const thickness = String(getRaw(cells, "espesor") || "").trim();
    const type = slugify(getRaw(cells, "tipo"));
    const plates = Number(rawPlates);

    if (!familyName || !productName || !Number.isFinite(plates) || !sectionsMap.has(thickness)) {
      return;
    }

    if (isLettersSection(thickness)) {
      return;
    }

    const normalizedType = type === "individual" ? "individual" : "grupo";
    const section = sectionsMap.get(thickness);
    const normalizedFamilyName = normalizedType === "individual" ? "Individuales" : familyName;
    const familyId = `fam-${thickness}-${slugify(normalizedFamilyName)}`;

    if (!section.familiesMap.has(familyId)) {
      section.familiesMap.set(familyId, {
        id: familyId,
        name: normalizedFamilyName,
        type: normalizedType,
        open: false,
        products: [],
        sortIndex: rowIndex,
      });
    }

    const family = section.familiesMap.get(familyId);
    family.products.push({
      id: `prd-${familyId}-${slugify(productName)}-${rowIndex}`,
      name: productName,
      plates,
      sourceFamily: familyName,
      sortIndex: rowIndex,
    });
  });

  return getThicknessEntries()
    .map((meta) => {
      const section = sectionsMap.get(meta.id);
      return {
        id: section.id,
        name: section.name,
        icon: section.icon,
        type: section.type,
        families: Array.from(section.familiesMap.values())
          .sort((a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name))
          .map((family) => ({
            ...family,
            products: family.products.sort(
              (a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)
            ),
          })),
      };
    })
    .filter((section) => section.type === "letters" || section.families.length > 0);
}

function render() {
  renderTabs();
  updateSearchVisibility();
  renderFamilies();
  renderSummary();
  hideScrollButton();
}

async function init() {
  applyClientUi();
  bindEvents();
  updateSearchVisibility();
  setFamiliesMessage("Cargando esquemas...");

  try {
    catalog = await loadCatalogFromSheet();
    if (!catalog.length) {
      setFamiliesMessage("No hay categorias disponibles para este cliente.");
      html.sendButton.disabled = true;
      return;
    }

    if (!catalog.some((section) => section.id === activeThickness)) {
      activeThickness = catalog[0].id;
    }

    render();
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    setFamiliesMessage(`No se pudieron cargar los esquemas desde Google Sheets. (${detail})`);
    html.sendButton.disabled = true;
  }
}

init();
