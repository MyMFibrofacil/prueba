(() => {
function createAppController({
  assetPrefix,
  clientConfig,
  clientKey,
  html,
  lettersConfig,
  state,
  summaryMode,
  thicknessMeta,
}) {
const LETTER_VOWELS = new Set(["A", "E", "I", "O", "U"]);
const SCROLL_BUTTON_IDLE_MS = 1400;
const textCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

let {
  activeThickness,
  catalog,
  emailSubmissionPending,
  pendingEmailStatusMessage,
  scrollButtonTimer,
  searchTerm,
  statusTimer,
  summaryOpen,
  toastTimer,
} = state;

const familyQuantities = state.familyQuantities;
const kitGroupOpenState = state.kitGroupOpenState;
const letterState = state.letterState;
const materialQuantities = state.materialQuantities;
const productQuantities = state.productQuantities;
const variantQuantities = state.variantQuantities;
let currentOrderId = createOrderId();
let categoryHomeOpen = Boolean(clientConfig?.categoryHome);
let activeCategoryId = "";

function createOrderId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function isKitSection(id) {
  return getSectionType(id) === "kits";
}

function getSectionUnitLabel(sectionId, count = 0) {
  const base = getThickness(sectionId).summaryUnit || "placas";
  if (base === "letras") return count === 1 ? "letra" : "letras";
  if (base === "items") return count === 1 ? "item" : "items";
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

function normalizePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

function openDesignsModal() {
  if (!html.designsModal) return;
  html.designsModal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeDesignsModal() {
  if (!html.designsModal) return;
  html.designsModal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function hideToast() {
  if (!html.toast) return;
  html.toast.classList.add("opacity-0", "-translate-y-3");
  html.toast.classList.remove("opacity-100", "translate-y-0");
  setTimeout(() => {
    if (!html.toast.classList.contains("opacity-100")) {
      html.toast.classList.add("hidden");
    }
  }, 300);
}

function showToast(message, tone = "muted") {
  if (!html.toast || !message || tone === "muted") return;
  if (toastTimer) clearTimeout(toastTimer);

  html.toast.textContent = message;
  html.toast.className =
    "pointer-events-none fixed left-1/2 top-5 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl opacity-0 -translate-y-3 transition-all duration-300";

  if (tone === "success") {
    html.toast.classList.add(
      "border",
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700",
      "shadow-emerald-900/10"
    );
  } else if (tone === "error") {
    html.toast.classList.add(
      "border",
      "border-red-200",
      "bg-red-50",
      "text-red-700",
      "shadow-red-900/10"
    );
  }

  html.toast.classList.remove("hidden");
  requestAnimationFrame(() => {
    html.toast.classList.remove("opacity-0", "-translate-y-3");
    html.toast.classList.add("opacity-100", "translate-y-0");
  });

  toastTimer = setTimeout(hideToast, 2600);
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

  if (!message) {
    if (toastTimer) clearTimeout(toastTimer);
    hideToast();
  } else {
    showToast(message, tone);
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

function getVariantQty(variantId) {
  return variantQuantities[variantId] || 0;
}

function getProductQty(productId) {
  return productQuantities[productId] || 0;
}

function getMaterialQty(materialId) {
  return materialQuantities[materialId] || 0;
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

function setVariantQty(variantId, value) {
  const next = normalizeQty(value);
  if (next === 0) {
    delete variantQuantities[variantId];
  } else {
    variantQuantities[variantId] = next;
  }
  render();
}

function updateVariantQty(variantId, delta) {
  setVariantQty(variantId, getVariantQty(variantId) + delta);
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

function setMaterialQty(materialId, value) {
  const next = normalizeQty(value);
  if (next === 0) {
    delete materialQuantities[materialId];
  } else {
    materialQuantities[materialId] = next;
  }
  render();
}

function updateMaterialQty(materialId, delta) {
  setMaterialQty(materialId, getMaterialQty(materialId) + delta);
}

function getFamilyProducts(family) {
  if (Array.isArray(family?.variants) && family.variants.length > 0) {
    return family.variants.flatMap((variant) => variant.products || []);
  }
  return family?.products || [];
}

function getFamilyVariants(family) {
  if (!Array.isArray(family?.variants) || family.variants.length === 0) return [];
  return family.variants;
}

function hasPlateVariants(family) {
  return family?.type === "grupo" && getFamilyVariants(family).length > 1;
}

function getSinglePlateReference(family) {
  if (family?.type !== "grupo") return "";
  const variants = getFamilyVariants(family);
  if (variants.length === 1) {
    return String(variants[0].plateLabel || "").trim();
  }
  return "";
}

function getVariantBasePlates(variant) {
  return (variant?.products || []).reduce((total, product) => total + (product.plates || 0), 0);
}

function getVariantTotalPlates(variant) {
  return getVariantBasePlates(variant) * getVariantQty(variant.id);
}

function getFamilyGroupTotalPlates(family) {
  if (hasPlateVariants(family)) {
    return getFamilyVariants(family).reduce((sum, variant) => sum + getVariantTotalPlates(variant), 0);
  }

  const familyQty = getFamilyQty(family.id);
  return getFamilyProducts(family).reduce((total, product) => total + product.plates, 0) * familyQty;
}

function normalizeSheetLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseFamilyPlateVariant(familyName) {
  const rawName = String(familyName || "").trim();
  const match = rawName.match(/^(.*)\s-\s(\d+\s*x\s*\d+)\s*$/i);

  if (!match) {
    return {
      familyName: rawName,
      plateLabel: "",
    };
  }

  return {
    familyName: String(match[1] || "").trim(),
    plateLabel: String(match[2] || "")
      .replace(/\s+/g, "")
      .toLowerCase(),
  };
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

function clearActiveSection() {
  const section = getActiveThickness();
  if (!section) return;

  if (isLettersSection(section.id)) {
    lettersConfig.letters.forEach((letter) => {
      lettersConfig.sizes.forEach((size) => {
        letterState.quantities[letter][size] = 0;
      });
    });
    setStatus(`Se limpio la categoria ${section.name}.`, "success");
    render();
    return;
  }

  if (section.type === "price-list") {
    section.products.forEach((product) => {
      delete productQuantities[product.id];
    });
    setStatus(`Se limpio la categoria ${section.name}.`, "success");
    render();
    return;
  }

  if (section.type === "kits") {
    section.families.forEach((family) => {
      delete familyQuantities[family.id];
      family.materialGroups?.forEach((group) => {
        delete materialQuantities[group.id];
      });
      family.products.forEach((product) => {
        delete productQuantities[product.id];
      });
    });
    setStatus(`Se limpio la categoria ${section.name}.`, "success");
    render();
    return;
  }

  section.families.forEach((family) => {
    delete familyQuantities[family.id];
    getFamilyVariants(family).forEach((variant) => {
      delete variantQuantities[variant.id];
    });
    getFamilyProducts(family).forEach((product) => {
      delete productQuantities[product.id];
    });
  });
  setStatus(`Se limpio la categoria ${section.name}.`, "success");
  render();
}

function clearCurrentOrder() {
  Object.keys(familyQuantities).forEach((key) => {
    delete familyQuantities[key];
  });

  Object.keys(variantQuantities).forEach((key) => {
    delete variantQuantities[key];
  });

  Object.keys(materialQuantities).forEach((key) => {
    delete materialQuantities[key];
  });

  Object.keys(productQuantities).forEach((key) => {
    delete productQuantities[key];
  });

  lettersConfig.letters.forEach((letter) => {
    lettersConfig.sizes.forEach((size) => {
      letterState.quantities[letter][size] = 0;
    });
  });

  summaryOpen = false;
  currentOrderId = createOrderId();
  render();

  if (html.catalogScroll) {
    html.catalogScroll.scrollTo({ top: 0, behavior: "smooth" });
  }
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
  const groupedBySize = lettersConfig.sizes
    .map((size) => ({
      size,
      items: lettersConfig.letters
        .map((letter) => ({
          letter,
          qty: letterState.quantities[letter]?.[size] || 0,
        }))
        .filter((item) => item.qty > 0),
    }))
    .filter((group) => group.items.length > 0);

  return {
    lines,
    groupedBySize,
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

function toggleKitGroup(groupId) {
  kitGroupOpenState[groupId] = !kitGroupOpenState[groupId];
  renderFamilies();
}

function renderTabs() {
  const categoryHomeTab = clientConfig?.categoryHome
    ? `
        <button
          data-category-home
          class="flex flex-col items-center min-w-[88px] justify-center border-b-[3px] ${
            categoryHomeOpen ? "border-primary text-primary" : "border-transparent text-slate-500"
          } gap-1 pb-2 pt-3"
        >
          <span class="material-symbols-outlined">category</span>
          <p class="text-xs ${categoryHomeOpen ? "font-bold" : "font-medium"} whitespace-nowrap">Categorías</p>
        </button>
      `
    : "";

  html.tabs.innerHTML = categoryHomeTab + getAvailableSections()
    .map((section) => {
      const active = !categoryHomeOpen && section.id === activeThickness;
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

function getCatalogCategories() {
  return catalog.flatMap((section) =>
    (section.categories || []).map((category) => ({
      ...category,
      sectionId: section.id,
      sectionName: section.name,
    }))
  );
}

function renderCategoryHome() {
  const categories = getCatalogCategories();
  if (!categories.length) {
    categoryHomeOpen = false;
    renderFamilies();
    return;
  }

  const term = searchTerm.toLowerCase();
  const filteredCategories = !term
    ? categories
    : categories.filter((category) =>
        category.name.toLowerCase().includes(term) ||
        category.sectionName.toLowerCase().includes(term) ||
        category.products.some((product) =>
          `${product.name} ${product.model || ""}`.toLowerCase().includes(term)
        )
      );

  html.families.innerHTML = filteredCategories.length
    ? `
      <section class="space-y-3">
        <div class="px-1">
          <h1 class="text-lg font-extrabold text-slate-900">Categorías</h1>
          <p class="mt-1 text-sm text-slate-500">Elegí una categoría para ver sus productos.</p>
        </div>
        <div class="space-y-3">
          ${filteredCategories
            .map(
              (category) => `
                <button
                  type="button"
                  data-category-select="${escapeHtml(category.id)}"
                  data-category-section="${escapeHtml(category.sectionId)}"
                  class="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-extrabold text-slate-800">${escapeHtml(category.name)}</p>
                    <p class="mt-1 text-xs text-slate-500">${escapeHtml(category.sectionName)} · ${category.products.length} productos</p>
                  </div>
                  <span class="material-symbols-outlined shrink-0 text-primary">chevron_right</span>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";
  html.empty.classList.toggle("hidden", filteredCategories.length > 0);
}

function searchMatchesFamily(family) {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  if (family.name.toLowerCase().includes(term)) return true;
  if (getFamilyVariants(family).some((variant) => String(variant.plateLabel || "").toLowerCase().includes(term))) {
    return true;
  }
  return getFamilyProducts(family).some((product) => {
    return (
      product.name.toLowerCase().includes(term) ||
      String(product.plateLabel || "").toLowerCase().includes(term) ||
      String(product.material || "").toLowerCase().includes(term) ||
      String(product.object || "").toLowerCase().includes(term)
    );
  });
}

function filteredProductsForFamily(family) {
  const products = getFamilyProducts(family);
  if (!searchTerm) return products;
  const term = searchTerm.toLowerCase();
  return products.filter((product) => {
    return (
      family.name.toLowerCase().includes(term) ||
      product.name.toLowerCase().includes(term) ||
      String(product.plateLabel || "").toLowerCase().includes(term) ||
      String(product.material || "").toLowerCase().includes(term) ||
      String(product.object || "").toLowerCase().includes(term)
    );
  });
}

function filteredVariantsForFamily(family) {
  const variants = getFamilyVariants(family);
  if (!searchTerm) return variants;

  const term = searchTerm.toLowerCase();
  return variants
    .map((variant) => {
      const variantMatches = String(variant.plateLabel || "").toLowerCase().includes(term);
      const products = (variant.products || []).filter((product) => {
        return (
          family.name.toLowerCase().includes(term) ||
          variantMatches ||
          product.name.toLowerCase().includes(term) ||
          String(product.material || "").toLowerCase().includes(term) ||
          String(product.object || "").toLowerCase().includes(term)
        );
      });

      if (!variantMatches && !products.length && !family.name.toLowerCase().includes(term)) {
        return null;
      }

      return {
        ...variant,
        products: products.length > 0 || !searchTerm ? products : variant.products,
      };
    })
    .filter(Boolean);
}

function renderGroupFamilyDetails(family, products) {
  const familyQty = getFamilyQty(family.id);
  const familyBase = getFamilyProducts(family).reduce((total, product) => total + product.plates, 0);

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

function renderVariantQtyControls(variant) {
  const qty = getVariantQty(variant.id);

  return `
    <div class="flex shrink-0 items-center bg-slate-100 rounded-lg p-1">
      <button
        data-variant-action="minus"
        data-variant="${escapeHtml(variant.id)}"
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
        data-variant-input="${escapeHtml(variant.id)}"
        class="w-12 h-8 text-center font-bold text-sm border-0 bg-transparent focus:ring-0 px-1"
      />
      <button
        data-variant-action="plus"
        data-variant="${escapeHtml(variant.id)}"
        class="size-8 flex items-center justify-center rounded-md ${
          qty > 0 ? "bg-primary text-white" : "bg-white text-primary"
        } shadow-sm"
        type="button"
      >
        <span class="material-symbols-outlined text-lg">add</span>
      </button>
    </div>
  `;
}

function renderGroupFamilyPlateVariants(family) {
  const variants = filteredVariantsForFamily(family);

  return `
    <div class="px-4 pb-4 space-y-3">
      ${variants
        .map((variant) => {
          const qty = getVariantQty(variant.id);
          const basePlates = getVariantBasePlates(variant);
          const groupId = `plate-variant-${variant.id}`;
          const isOpen = searchTerm ? true : Boolean(kitGroupOpenState[groupId]);

          return `
            <section class="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div class="px-4 py-3 flex items-start justify-between gap-3 bg-slate-50">
                <button
                  type="button"
                  data-kit-group-toggle="${escapeHtml(groupId)}"
                  class="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-bold text-slate-800">Placa ${escapeHtml(variant.plateLabel)}</p>
                    <p class="text-xs text-slate-500 mt-1">Cantidad pedida para esta placa</p>
                    ${
                      qty > 0
                        ? `<p class="text-xs text-primary font-semibold mt-1">${basePlates * qty} placas totales para esta variante</p>`
                        : ""
                    }
                  </div>
                  <span class="material-symbols-outlined text-slate-500 shrink-0">${isOpen ? "expand_less" : "expand_more"}</span>
                </button>
                ${renderVariantQtyControls(variant)}
              </div>
              ${
                isOpen
                  ? `<div class="divide-y divide-slate-100">
                      ${variant.products
                        .map((product) => {
                          const total = product.plates * qty;
                          return `
                            <div class="p-3 flex items-start justify-between gap-3 bg-white">
                              <div class="min-w-0">
                                <p class="text-sm font-semibold text-slate-800 break-words">${escapeHtml(product.name)}</p>
                                <p class="text-xs text-slate-500">Base por 1 unidad: ${product.plates} placas</p>
                              </div>
                              <div class="text-right shrink-0">
                                <p class="text-sm font-bold text-primary">${total > 0 ? `${total} placas` : "-"}</p>
                                ${
                                  qty > 0
                                    ? `<p class="text-[11px] text-slate-500 mt-1">${product.plates} x ${qty}</p>`
                                    : ""
                                }
                              </div>
                            </div>
                          `;
                        })
                        .join("")}
                    </div>`
                  : ""
              }
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderIndividualProductRow(product) {
  const qty = getProductQty(product.id);
  const displayName = getProductDisplayName(product);

  return `
    <div class="p-4 flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-semibold text-slate-800 break-words whitespace-normal leading-snug">${escapeHtml(displayName)}</h4>
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

function renderValueProductRow(product, metaLabel = "", displayName = "") {
  const qty = getProductQty(product.id);
  const subtotal = qty * normalizePrice(product.unitPrice);
  const title = displayName || product.name;

  return `
    <div class="p-4 flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-slate-800 break-words">${escapeHtml(title)}</p>
        ${
          metaLabel
            ? `<p class="mt-1 text-xs text-slate-500">${escapeHtml(metaLabel)}</p>`
            : ""
        }
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
}

function renderKitGroupCard(
  family,
  title,
  items,
  field,
  groupLabel,
  contentRenderer = null,
  headerControls = "",
  priceLabel = ""
) {
  const groupId = `kit-group-${field}-${family.id}-${slugify(groupLabel)}`;
  const isOpen = searchTerm ? true : Boolean(kitGroupOpenState[groupId]);
  const detailLabel =
    field === "material"
      ? `${items.length} ${items.length === 1 ? "pieza" : "piezas"}`
      : `${items.length} ${items.length === 1 ? "opcion" : "opciones"}`;

  return `
    <section class="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div class="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50">
        <button
          type="button"
          data-kit-group-toggle="${escapeHtml(groupId)}"
          class="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(title)}</p>
              ${
                priceLabel
                  ? `<p class="text-xs text-slate-500">${escapeHtml(priceLabel)}</p>`
                  : ""
              }
            </div>
            <p class="text-xs text-slate-500 mt-1">${escapeHtml(detailLabel)}</p>
          </div>
          <span class="material-symbols-outlined text-slate-500 shrink-0">${isOpen ? "expand_less" : "expand_more"}</span>
        </button>
        ${
          headerControls
            ? `<div class="shrink-0">${headerControls}</div>`
            : ""
        }
      </div>
      ${
        isOpen
          ? `<div class="divide-y divide-slate-100">
              ${items
                .map((item) => {
                  if (contentRenderer) return contentRenderer(item);
                  const metaLabel = field === "material" ? item.object : item.material;
                  return renderValueProductRow(item, metaLabel);
                })
                .join("")}
            </div>`
          : ""
      }
    </section>
  `;
}

function groupProductsBy(products, key) {
  const groups = new Map();
  products.forEach((product) => {
    const value = String(product[key] || "").trim();
    if (!value) return;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(product);
  });
  return Array.from(groups.entries())
    .sort((a, b) => compareText(a[0], b[0]))
    .map(([label, items]) => ({ label, items }));
}

function renderKitFamilyDetails(family, products) {
  const productIds = new Set(products.map((product) => product.id));
  const visibleMaterialGroups = (family.materialGroups || []).filter((group) =>
    group.products.some((product) => productIds.has(product.id))
  );

  return `
    <div class="px-4 pb-4 space-y-3">
      ${visibleMaterialGroups
        .map((group) => {
          const materialQty = getMaterialQty(group.id);
          const controls = `
            <div class="flex shrink-0 items-center bg-slate-100 rounded-lg p-1">
              <button
                data-material-action="minus"
                data-material="${escapeHtml(group.id)}"
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
                value="${materialQty}"
                data-material-input="${escapeHtml(group.id)}"
                class="w-12 h-8 text-center font-bold text-sm border-0 bg-transparent focus:ring-0 px-1"
              />
              <button
                data-material-action="plus"
                data-material="${escapeHtml(group.id)}"
                class="size-8 flex items-center justify-center rounded-md ${
                  materialQty > 0 ? "bg-primary text-white" : "bg-white text-primary"
                } shadow-sm"
                type="button"
              >
                <span class="material-symbols-outlined text-lg">add</span>
              </button>
            </div>
          `;

          return renderKitGroupCard(family, group.name, group.products, "material", group.name, (product) =>
            renderValueProductRow(product, "", product.object), controls, formatCurrency(group.basePrice)
          );
        })
        .join("")}
    </div>
  `;
}

function renderFamilyCard(family) {
  const filteredProducts = filteredProductsForFamily(family);
  if (searchTerm && filteredProducts.length === 0 && !searchMatchesFamily(family)) return "";

  if (family.type === "kit") {
    const isOpen = searchTerm ? true : family.open;
    const products = searchTerm ? filteredProducts : family.products;
    const familyQty = getFamilyQty(family.id);
    const materialsValue = (family.materialGroups || []).reduce(
      (sum, group) => sum + getMaterialQty(group.id) * group.basePrice,
      0
    );
    const extrasValue = family.products.reduce(
      (sum, product) => sum + getProductQty(product.id) * normalizePrice(product.unitPrice),
      0
    );
    const totalValue = familyQty * family.basePrice + materialsValue + extrasValue;

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
                ${family.products.length} piezas - ${escapeHtml(formatCurrency(family.basePrice))} el kit
              </p>
              ${
                totalValue > 0
                  ? `<p class="text-xs text-primary font-semibold mt-1">Pedido actual: ${escapeHtml(formatCurrency(totalValue))}</p>`
                  : ""
              }
            </div>
          </button>
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
        </div>
        ${isOpen ? renderKitFamilyDetails(family, products) : ""}
      </section>
    `;
  }

  if (hasPlateVariants(family)) {
    const isOpen = searchTerm ? true : family.open;
    const familyTotal = getFamilyGroupTotalPlates(family);
    const familyProducts = getFamilyProducts(family);

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
                ${familyProducts.length} productos - ${getFamilyVariants(family).length} placas disponibles
              </p>
              ${
                familyTotal > 0
                  ? `<p class="text-xs text-primary font-semibold mt-1">Pedido actual: ${familyTotal} placas</p>`
                  : ""
              }
            </div>
          </button>
        </div>
        ${isOpen ? renderGroupFamilyPlateVariants(family) : ""}
      </section>
    `;
  }

  const products = family.type === "grupo" && searchTerm ? getFamilyProducts(family) : filteredProducts;
  const isOpen = searchTerm ? true : family.open;
  const familyQty = getFamilyQty(family.id);
  const familyProducts = getFamilyProducts(family);
  const familyBase = familyProducts.reduce((total, product) => total + product.plates, 0);
  const plateReference = getSinglePlateReference(family);
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
                  ? `${familyProducts.length} productos - ${familyBase} placas por familia`
                  : `${familyProducts.length} producto${familyProducts.length === 1 ? "" : "s"}`
              }
            </p>
            ${
              plateReference
                ? `<p class="text-xs text-slate-500 mt-1">Placa de referencia: ${escapeHtml(plateReference)}</p>`
                : ""
            }
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

function renderQuickStepButtons() {
  return lettersConfig.quickSteps
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
}

function renderLettersSection() {
  const filteredLetters = getFilteredLetters();
  const activeFilterLabel = getActiveLetterFilterLabel(filteredLetters.length);

  const steps = renderQuickStepButtons();

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
        <button
          type="button"
          data-category-clear="active"
          class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"
        >
          Limpiar categoria
        </button>
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

  const selectedCategory = activeCategoryId
    ? (section.categories || []).find((category) => category.id === activeCategoryId)
    : null;
  const categories = selectedCategory ? [selectedCategory] : Array.isArray(section.categories) ? section.categories : [];
  const categoryMarkup = categories.length
    ? categories
        .map((category) => {
          const matchingProducts = category.products.filter((product) => filteredProducts.includes(product));
          if (!matchingProducts.length) return "";
          const open = searchTerm || Boolean(kitGroupOpenState[category.id]);
          return `
            <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                data-kit-group-toggle="${escapeHtml(category.id)}"
                class="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div class="min-w-0">
                  <p class="text-sm font-extrabold text-slate-800">${escapeHtml(category.name)}</p>
                  <p class="mt-1 text-xs text-slate-500">${matchingProducts.length} productos</p>
                </div>
                <span class="material-symbols-outlined text-slate-500 transition-transform ${open ? "rotate-180" : ""}">expand_more</span>
              </button>
              ${
                open
                  ? `<div class="divide-y divide-slate-100 border-t border-slate-100">${matchingProducts
                      .map((product) => renderValueProductRow(product, product.model || ""))
                      .join("")}</div>`
                  : ""
              }
            </article>
          `;
        })
        .join("")
    : `<div class="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
        ${filteredProducts.map((product) => renderValueProductRow(product)).join("")}
      </div>`;

  html.families.innerHTML = `
    <section class="space-y-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Categoria</p>
            <p class="mt-1 text-sm font-semibold text-slate-800">${escapeHtml(selectedCategory?.name || section.name)}</p>
          </div>
          <p class="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Paso ${escapeHtml(letterState.step)}
          </p>
        </div>
        ${
          selectedCategory && clientConfig?.categoryHome
            ? `<button type="button" data-category-home class="flex items-center gap-1 text-sm font-bold text-primary"><span class="material-symbols-outlined text-base">arrow_back</span>Ver todas las categorías</button>`
            : ""
        }
        <div class="flex gap-2 overflow-x-auto scrollbar-hide">${renderQuickStepButtons()}</div>
        <button
          type="button"
          data-category-clear="active"
          class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"
        >
          Limpiar categoria
        </button>
      </div>
      <div class="space-y-3">${categoryMarkup}</div>
    </section>
  `;
  html.empty.classList.add("hidden");
}

function renderFamilies() {
  if (categoryHomeOpen) {
    renderCategoryHome();
    return;
  }
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

  if (section.type === "kits") {
    const cards = section.families.map(renderFamilyCard).filter(Boolean).join("");
    html.families.innerHTML = cards
      ? `
        <section class="space-y-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Categoria</p>
                <p class="mt-1 text-sm font-semibold text-slate-800">${escapeHtml(section.name)}</p>
              </div>
              <p class="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                Paso ${escapeHtml(letterState.step)}
              </p>
            </div>
            <div class="flex gap-2 overflow-x-auto scrollbar-hide">${renderQuickStepButtons()}</div>
            <button
              type="button"
              data-category-clear="active"
              class="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"
            >
              Limpiar categoria
            </button>
          </div>
          <div class="space-y-3">${cards}</div>
        </section>
      `
      : "";
    html.empty.classList.toggle("hidden", Boolean(cards));
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
        totalsByValue[section.id] = lettersSummary.subtotal;
        totalCount += lettersSummary.total;
        totalValue += lettersSummary.subtotal;
        sections.push({
          id: section.id,
          name: section.name,
          type: "letters",
          totalCount: lettersSummary.total,
          groupedBySize: lettersSummary.groupedBySize,
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

    if (section.type === "kits") {
      const families = [];
      let sectionQuantity = 0;
      let sectionValue = 0;

      section.families.forEach((family) => {
        const fullKitQty = getFamilyQty(family.id);
        const selectedMaterials = (family.materialGroups || [])
          .map((group) => ({
            ...group,
            qty: getMaterialQty(group.id),
          }))
          .filter((group) => group.qty > 0);
        const selectedProducts = family.products
          .map((product) => ({
            ...product,
            qty: getProductQty(product.id),
          }))
          .filter((product) => product.qty > 0);

        if (fullKitQty <= 0 && selectedMaterials.length === 0 && selectedProducts.length === 0) return;

        const breakdown = [];
        if (fullKitQty > 0) {
          breakdown.push({
            kind: "full-kit",
            name: "Kit completo",
            qty: fullKitQty,
            subtotal: fullKitQty * family.basePrice,
          });
        }

        selectedMaterials.forEach((group) => {
          breakdown.push({
            kind: "material",
            name: group.name,
            qty: group.qty,
            subtotal: group.qty * group.basePrice,
          });
        });

        selectedProducts.forEach((product) => {
          breakdown.push({
            kind: "piece",
            name: `${product.material} - ${product.object}`,
            qty: product.qty,
            subtotal: product.qty * product.unitPrice,
          });
        });

        const familyQuantity =
          fullKitQty +
          selectedMaterials.reduce((sum, group) => sum + group.qty, 0) +
          selectedProducts.reduce((sum, product) => sum + product.qty, 0);
        const familyValue = breakdown.reduce((sum, item) => sum + item.subtotal, 0);

        sectionQuantity += familyQuantity;
        sectionValue += familyValue;
        totalCount += familyQuantity;
        totalValue += familyValue;

        families.push({
          type: "kit",
          name: family.name,
          totalCount: familyQuantity,
          totalValue: familyValue,
          breakdown,
        });
      });

      if (families.length > 0) {
        totalsByThickness[section.id] = sectionQuantity;
        totalsByValue[section.id] = sectionValue;
        sections.push({
          id: section.id,
          name: section.name,
          type: "kits",
          totalCount: sectionQuantity,
          subtotal: sectionValue,
          families,
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
      totalsByValue[section.id] = subtotal;
      totalCount += quantity;
      totalValue += subtotal;

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
        if (hasPlateVariants(family)) {
          const variants = getFamilyVariants(family)
            .map((variant) => {
              const qty = getVariantQty(variant.id);
              if (qty <= 0) return null;

              const breakdown = variant.products.map((product) => ({
                name: product.name,
                basePlates: product.plates,
                totalPlates: product.plates * qty,
              }));

              return {
                plateLabel: variant.plateLabel,
                multiplier: qty,
                totalPlates: breakdown.reduce((sum, item) => sum + item.totalPlates, 0),
                breakdown,
              };
            })
            .filter(Boolean);

          if (variants.length === 0) return;

          const familyTotal = variants.reduce((sum, variant) => sum + variant.totalPlates, 0);
          totalCount += familyTotal;
          sectionTotal += familyTotal;

          families.push({
            type: "grupo-placa",
            name: family.name,
            totalPlates: familyTotal,
            variants,
          });
          return;
        }

        const qty = getFamilyQty(family.id);
        if (qty <= 0) return;

        const breakdown = getFamilyProducts(family).map((product) => ({
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
          plateReference: getSinglePlateReference(family),
          multiplier: qty,
          totalPlates: familyTotal,
          breakdown,
        });
        return;
      }

      const selectedProducts = family.products
        .map((product) => ({
          name: getProductDisplayName(product),
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
          name: product.name,
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

function formatGrandTotal(data) {
  if (summaryMode === "value") {
    return formatCurrency(data.totalValue);
  }

  return `${data.totalCount} items`;
}

function formatSectionSummaryValue(section, data) {
  if (summaryMode === "value") {
    return formatCurrency(data.totalsByValue[section.id] || 0);
  }

  return formatSectionCount(section.id, data.totalsByThickness[section.id] || 0);
}

function sanitizeMessageText(value) {
  return String(value || "")
    .replace(/\*/g, "")
    .trim();
}

function getProductDisplayName(product) {
  const baseName = String(product?.name || "").trim();
  const plateLabel = String(product?.plateLabel || "").trim();
  if (!baseName) return plateLabel;
  if (!plateLabel) return baseName;
  return `${baseName} - ${plateLabel}`;
}

function renderSummary() {
  const data = summary();

  if (html.summaryTotals) {
    const summarySections = getAvailableSections().filter((section) => {
      if (!clientConfig?.hideEmptySummarySections) return true;
      const value = data.totalsByValue[section.id] || 0;
      const count = data.totalsByThickness[section.id] || 0;
      return summaryMode === "value" ? value > 0 : count > 0;
    });

    const totalsMarkup = summarySections
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

    const grandTotalMarkup = `
      <div class="mt-2 border-t border-slate-200 pt-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-extrabold text-primary">Total general:</p>
          <p class="text-sm font-extrabold text-primary shrink-0">${escapeHtml(formatGrandTotal(data))}</p>
        </div>
      </div>
    `;

    html.summaryTotals.innerHTML = `${totalsMarkup}${grandTotalMarkup}`;
  }

  html.sendButton.disabled = data.totalCount === 0;

  if (data.sections.length === 0) {
    html.summaryDetailsList.innerHTML =
      '<p class="p-4 text-sm text-slate-500">Todavia no agregaste items al pedido.</p>';
    summaryOpen = false;
  } else {
    const sectionsMarkup = data.sections
      .map((section) => {
        if (section.type === "letters") {
          return `
            <div class="border-b border-slate-200 last:border-b-0">
              <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(section.name)}</p>
              </div>
              <div class="p-4 space-y-3">
                ${section.groupedBySize
                  .map((group) => {
                    return `
                      <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div class="px-3 py-2 bg-slate-50 border-b border-slate-200">
                          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(group.size)}mm</p>
                        </div>
                        <div class="px-3 py-3 space-y-2">
                          ${group.items
                            .map((item) => {
                              return `
                                <div class="flex items-start justify-between gap-3 text-sm">
                                  <p class="font-semibold text-slate-700">- ${escapeHtml(item.letter)}:</p>
                                  <p class="font-semibold text-slate-900 shrink-0">${item.qty}</p>
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
        }

        if (section.type === "price-list") {
          return `
            <div class="border-b border-slate-200 last:border-b-0">
              <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(section.name)}</p>
              </div>
              <div class="p-4 space-y-3">
                <div class="space-y-2">
                  ${section.products
                    .map((product) => {
                      return `
                        <div class="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <p class="text-sm font-semibold text-slate-800">${escapeHtml(product.name)}</p>
                          <p class="mt-1 text-xs text-slate-500">- Cantidad: ${product.qty}</p>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            </div>
          `;
        }

        if (section.type === "kits") {
          return `
            <div class="border-b border-slate-200 last:border-b-0">
              <div class="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(section.name)}</p>
              </div>
              <div class="divide-y divide-slate-100">
                ${section.families
                  .map((family) => {
                    return `
                      <div class="p-4 space-y-2">
                        <div class="flex items-start justify-between gap-3">
                          <p class="text-sm font-semibold text-slate-800">${escapeHtml(family.name)}</p>
                          <p class="text-sm font-bold text-primary shrink-0">${escapeHtml(formatCurrency(family.totalValue))}</p>
                        </div>
                        <div class="space-y-1">
                          ${family.breakdown
                            .map((item) => {
                              return `
                                <div class="flex items-start justify-between gap-3 text-xs">
                                  <p class="text-slate-500 min-w-0">${escapeHtml(`${item.name} x${item.qty}`)}</p>
                                  <p class="text-slate-700 shrink-0">${escapeHtml(formatCurrency(item.subtotal))}</p>
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
                  const plateReferenceLabel =
                    family.type === "grupo" && family.plateReference
                      ? `<p class="text-xs text-slate-500">Placa de referencia: ${escapeHtml(family.plateReference)}</p>`
                      : "";
                  const variantMarkup =
                    family.type === "grupo-placa"
                      ? `
                        <div class="space-y-3">
                          ${family.variants
                            .map((variant) => {
                              return `
                                <div class="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                  <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                      <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Placa ${escapeHtml(variant.plateLabel)}</p>
                                      <p class="mt-1 text-xs text-slate-500">${variant.multiplier}x variante</p>
                                    </div>
                                    <p class="text-sm font-bold text-primary shrink-0">${formatSectionCount(section.id, variant.totalPlates)}</p>
                                  </div>
                                  <div class="mt-2 space-y-1">
                                    ${variant.breakdown
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
                      `
                      : "";

                  return `
                    <div class="p-4 space-y-2">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-semibold text-slate-800">${escapeHtml(family.name)}</p>
                          ${multiplierLabel}
                          ${plateReferenceLabel}
                        </div>
                        <p class="text-sm font-bold text-primary shrink-0">${formatSectionCount(section.id, family.totalPlates)}</p>
                      </div>
                      ${
                        family.type === "grupo-placa"
                          ? variantMarkup
                          : `<div class="space-y-1">
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
                            </div>`
                      }
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `;
      })
      .join("");

    const grandTotalDetailsMarkup = `
      <div class="px-4 py-4 bg-slate-50">
        <div class="rounded-xl border border-primary/15 bg-white overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Resumen final</p>
          </div>
          <div class="px-4 py-3 space-y-2">
            ${data.sections
              .map((section) => {
                return `
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <p class="font-bold text-slate-700">Total ${escapeHtml(section.name)}:</p>
                    <p class="font-bold text-slate-900 shrink-0">${escapeHtml(formatSectionSummaryValue(section, data))}</p>
                  </div>
                `;
              })
              .join("")}
            <div class="border-t border-slate-200 pt-2">
              <div class="flex items-center justify-between gap-3 text-sm">
                <p class="font-extrabold text-primary">Total general:</p>
                <p class="font-extrabold text-primary">${escapeHtml(formatGrandTotal(data))}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    html.summaryDetailsList.innerHTML = `${sectionsMarkup}${grandTotalDetailsMarkup}`;
  }

  html.summaryDetailsPanel.classList.toggle("hidden", !summaryOpen);
  html.summaryChevron.style.transform = summaryOpen ? "rotate(0deg)" : "rotate(180deg)";
}

function buildWhatsAppText() {
  const data = summary();
  const lines = [];

  data.sections.forEach((section) => {
    const sectionMeta = getThickness(section.id);
    const sectionLabel =
      section.type === "price-list"
        ? section.name
        : sectionMeta.messageLabel || sectionMeta.summaryLabel || section.name;
    lines.push("");
    lines.push(`*${sanitizeMessageText(sectionLabel)}*`);

    if (section.type === "letters") {
      section.groupedBySize.forEach((group) => {
        lines.push("");
        lines.push(`${group.size}mm`);
        group.items.forEach((item) => {
          lines.push(`- ${item.letter}: ${item.qty}`);
        });
      });
      return;
    }

    if (section.type === "kits") {
      section.families.forEach((family, index) => {
        lines.push(`${sanitizeMessageText(family.name)}`);
        family.breakdown.forEach((item) => {
          lines.push(`- ${sanitizeMessageText(item.name)}: ${item.qty}`);
        });

        if (index < section.families.length - 1) {
          lines.push("");
        }
      });
      return;
    }

    if (section.type === "price-list") {
      section.products.forEach((product) => {
        lines.push(`${sanitizeMessageText(product.name)}`);
        lines.push(`- Cantidad: ${product.qty}`);
      });
      return;
    }

    section.families.forEach((family, index) => {
      if (family.type === "grupo-placa") {
        lines.push(`${sanitizeMessageText(family.name)}`);
        family.variants.forEach((variant) => {
          const copiesLabel = variant.multiplier === 1 ? "1 copia" : `${variant.multiplier} copias`;
          lines.push(`- Placa ${variant.plateLabel} (${copiesLabel})`);
          variant.breakdown.forEach((item) => {
            lines.push(`  - ${sanitizeMessageText(item.name)}: ${item.totalPlates} placas`);
          });
        });
      } else if (family.type === "grupo") {
        lines.push(`${sanitizeMessageText(family.name)}`);
        const copiesLabel = family.multiplier === 1 ? "1 copia" : `${family.multiplier} copias`;
        if (family.plateReference) {
          lines.push(`- Placa ${family.plateReference} (${copiesLabel})`);
        } else {
          lines.push(`- ${copiesLabel}`);
        }
      } else {
        lines.push(`${sanitizeMessageText(family.name)}`);
      }

      if (family.breakdown) {
        family.breakdown.forEach((item) => {
          lines.push(
            family.type === "grupo"
              ? `  - ${sanitizeMessageText(item.name)}: ${item.totalPlates} placas`
              : `- ${sanitizeMessageText(item.name)}: ${item.totalPlates} placas`
          );
        });
      }

      if (index < section.families.length - 1) {
        lines.push("");
      }
    });

  });

  lines.push("");
  lines.push("RESUMEN FINAL");
  data.sections.forEach((section) => {
    lines.push(`*Total ${sanitizeMessageText(section.name)}: ${formatSectionSummaryValue(section, data)}*`);
  });
  lines.push("");
  lines.push(`*Total general: ${formatGrandTotal(data)}*`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildXubioOrderData() {
  const items = [];
  const addItem = (description, quantity, price) => {
    const qty = Number(quantity);
    const unitPrice = Number(price);
    if (!description || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return;
    items.push({
      descripcion: String(description).trim(),
      cantidad: qty,
      precio: unitPrice,
    });
  };

  catalog.forEach((section) => {
    if (isLettersSection(section.id)) {
      lettersConfig.letters.forEach((letter) => {
        lettersConfig.sizes.forEach((size) => {
          addItem(
            `${letter} ${size} mm - ${lettersConfig.materialLabel}`,
            letterState.quantities[letter]?.[size] || 0,
            letterState.prices[size] || 0
          );
        });
      });
      return;
    }

    if (section.type === "price-list") {
      section.products.forEach((product) => {
        const model = String(product.model || "").trim();
        addItem(
          [section.name, product.name, model].filter(Boolean).join(" - "),
          getProductQty(product.id),
          product.unitPrice
        );
      });
      return;
    }

    if (section.type === "kits") {
      section.families.forEach((family) => {
        addItem(`${family.name} - Kit completo`, getFamilyQty(family.id), family.basePrice);
        (family.materialGroups || []).forEach((group) => {
          addItem(`${family.name} - ${group.name}`, getMaterialQty(group.id), group.basePrice);
        });
        family.products.forEach((product) => {
          addItem(
            `${family.name} - ${product.material} - ${product.object}`,
            getProductQty(product.id),
            product.unitPrice
          );
        });
      });
    }
  });

  return {
    version: 1,
    orderId: currentOrderId,
    currency: "ARS",
    items,
  };
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

function getSendMode() {
  if (clientConfig?.sendMode === "form-post-email") return "form-post-email";
  if (clientConfig?.sendMode === "direct-email") return "direct-email";
  if (clientConfig?.sendMode === "email") return "email";
  return "whatsapp";
}

function getOrderDateLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function getEmailSubject() {
  const explicitSubject = String(clientConfig?.emailSubject || "").trim();
  if (explicitSubject) return explicitSubject;

  const subjectPrefix = String(clientConfig?.emailSubjectPrefix || `Pedido ${clientConfig?.name || ""}`.trim() || "Pedido");
  return `${subjectPrefix} - ${getOrderDateLabel()}`;
}

function buildEmailLink(text) {
  const recipient = String(clientConfig?.emailTo || "").trim();
  const params = new URLSearchParams({
    subject: getEmailSubject(),
    body: text,
  });
  return `mailto:${recipient}?${params.toString()}`;
}

async function sendDirectEmail(text) {
  const endpoint = String(clientConfig?.sendEndpoint || "").trim();
  if (!endpoint) {
    throw new Error("Falta configurar el endpoint de envio de mail.");
  }

  const payload = JSON.stringify({
    from: "mymfibrofacil.web@gmail.com",
    to: String(clientConfig?.emailTo || "").trim(),
    subject: getEmailSubject(),
    body: text,
    clientKey,
    clientName: clientConfig?.name || "",
    createdAt: new Date().toISOString(),
  });

  if (navigator.sendBeacon) {
    const queued = navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: "text/plain;charset=UTF-8" })
    );
    if (queued) return;
  }

  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: payload,
    keepalive: true,
  });
}

function submitEmailForm(text) {
  if (!html.emailForm) {
    throw new Error("No se encontro el formulario de envio.");
  }

  const endpoint = String(clientConfig?.sendEndpoint || "").trim();
  if (!endpoint) {
    throw new Error("Falta configurar el endpoint de envio de mail.");
  }

  html.emailForm.action = endpoint;

  const assignValue = (name, value) => {
    const field = html.emailForm.elements.namedItem(name);
    if (!field) return;
    field.value = value;
  };

  assignValue("from", "mymfibrofacil.web@gmail.com");
  assignValue("to", String(clientConfig?.emailTo || "").trim());
  assignValue("subject", getEmailSubject());
  assignValue("body", text);
  assignValue("client_key", clientKey);
  assignValue("client_name", clientConfig?.name || "");
  assignValue("created_at", new Date().toISOString());
  assignValue("order_data", JSON.stringify(buildXubioOrderData()));

  html.emailForm.submit();
}

async function sendOrder() {
  const text = buildWhatsAppText();
  const copied = await copyText(text);
  const sendMode = getSendMode();

  if (sendMode === "form-post-email") {
    try {
      emailSubmissionPending = true;
      pendingEmailStatusMessage = copied
        ? "Pedido enviado por mail y copiado al portapapeles."
        : "Pedido enviado por mail.";
      setStatus("Enviando pedido por mail...");
      submitEmailForm(text);
    } catch (error) {
      emailSubmissionPending = false;
      pendingEmailStatusMessage = "";
      const detail = error instanceof Error ? error.message : "No se pudo enviar el pedido por mail.";
      setStatus(detail, "error");
    }
    return;
  }

  if (sendMode === "direct-email") {
    try {
      await sendDirectEmail(text);
      setStatus(
        copied
          ? "Pedido enviado por mail y copiado al portapapeles."
          : "Pedido enviado por mail.",
        "success"
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo enviar el pedido por mail.";
      setStatus(detail, "error");
    }
    return;
  }

  if (sendMode === "email") {
    window.location.href = buildEmailLink(text);

    if (copied) {
      setStatus("Pedido copiado. Se abrio tu correo con el pedido precargado.", "success");
    } else {
      setStatus("Se abrio tu correo. Si no aparece el texto, copialo desde el resumen.", "error");
    }
    return;
  }

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
    const categoryHomeButton = event.target.closest("[data-category-home]");
    if (categoryHomeButton) {
      categoryHomeOpen = true;
      activeCategoryId = "";
      render();
      return;
    }
    const button = event.target.closest("[data-thickness]");
    if (!button) return;
    activeThickness = button.dataset.thickness;
    categoryHomeOpen = false;
    activeCategoryId = "";
    render();
  });

  html.families.addEventListener("click", (event) => {
    const categoryHomeButton = event.target.closest("[data-category-home]");
    if (categoryHomeButton) {
      categoryHomeOpen = true;
      activeCategoryId = "";
      render();
      return;
    }

    const categoryButton = event.target.closest("[data-category-select][data-category-section]");
    if (categoryButton) {
      activeThickness = categoryButton.dataset.categorySection;
      activeCategoryId = categoryButton.dataset.categorySelect;
      categoryHomeOpen = false;
      if (html.catalogScroll) html.catalogScroll.scrollTo({ top: 0, behavior: "smooth" });
      render();
      return;
    }

    const toggleButton = event.target.closest("[data-family]");
    if (toggleButton) {
      toggleFamily(toggleButton.dataset.family);
      return;
    }

    const kitGroupButton = event.target.closest("[data-kit-group-toggle]");
    if (kitGroupButton) {
      toggleKitGroup(kitGroupButton.dataset.kitGroupToggle);
      return;
    }

    const familyQtyButton = event.target.closest("[data-family-action][data-family-qty]");
    if (familyQtyButton) {
      const delta = familyQtyButton.dataset.familyAction === "plus" ? letterState.step : -letterState.step;
      updateFamilyQty(familyQtyButton.dataset.familyQty, delta);
      return;
    }

    const variantQtyButton = event.target.closest("[data-variant-action][data-variant]");
    if (variantQtyButton) {
      const delta = variantQtyButton.dataset.variantAction === "plus" ? letterState.step : -letterState.step;
      updateVariantQty(variantQtyButton.dataset.variant, delta);
      return;
    }

    const materialQtyButton = event.target.closest("[data-material-action][data-material]");
    if (materialQtyButton) {
      const delta = materialQtyButton.dataset.materialAction === "plus" ? letterState.step : -letterState.step;
      updateMaterialQty(materialQtyButton.dataset.material, delta);
      return;
    }

    const productQtyButton = event.target.closest("[data-product-action][data-product]");
    if (productQtyButton) {
      const delta = productQtyButton.dataset.productAction === "plus" ? letterState.step : -letterState.step;
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

    const clearCategoryButton = event.target.closest("[data-category-clear]");
    if (clearCategoryButton) {
      clearActiveSection();
    }
  });

  html.families.addEventListener("change", (event) => {
    const familyInput = event.target.closest("[data-family-input]");
    if (familyInput) {
      setFamilyQty(familyInput.dataset.familyInput, familyInput.value);
      return;
    }

    const variantInput = event.target.closest("[data-variant-input]");
    if (variantInput) {
      setVariantQty(variantInput.dataset.variantInput, variantInput.value);
      return;
    }

    const productInput = event.target.closest("[data-product-input]");
    if (productInput) {
      setProductQty(productInput.dataset.productInput, productInput.value);
      return;
    }

    const materialInput = event.target.closest("[data-material-input]");
    if (materialInput) {
      setMaterialQty(materialInput.dataset.materialInput, materialInput.value);
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

  html.sendButton.addEventListener("click", sendOrder);

  if (html.emailFrame) {
    html.emailFrame.addEventListener("load", () => {
      if (!emailSubmissionPending) return;
      emailSubmissionPending = false;
      clearCurrentOrder();
      setStatus(pendingEmailStatusMessage || "Pedido enviado por mail.", "success");
      pendingEmailStatusMessage = "";
    });
  }

  if (html.openDesigns) {
    html.openDesigns.addEventListener("click", openDesignsModal);
  }

  if (html.closeDesigns) {
    html.closeDesigns.addEventListener("click", closeDesignsModal);
  }

  if (html.designsModal) {
    html.designsModal.addEventListener("click", (event) => {
      if (event.target === html.designsModal) {
        closeDesignsModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && html.designsModal && !html.designsModal.classList.contains("hidden")) {
      closeDesignsModal();
    }
  });

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

  const hasSheet = Boolean(clientConfig.sheetId) && clientConfig.sheetGid !== undefined;

  const parseSheetResponseText = (rawText) => {
    const match = rawText.match(/google\.visualization\.Query\.setResponse\((.*)\);?\s*$/s);
    if (!match) {
      throw new Error("Formato de respuesta de Google Sheets no reconocido");
    }
    return JSON.parse(match[1]);
  };

  const loadSheetData = async (gid) => {
    if (!hasSheet) return { table: { cols: [], rows: [] } };

    const url = `https://docs.google.com/spreadsheets/d/${clientConfig.sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

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
      return await loadWithFetch();
    } catch (_error) {
      return loadWithScript();
    }
  };

  if (clientConfig?.catalogMode === "moreira-categories") {
    const categoriesData = await loadSheetData(clientConfig.catalogSheetGid || clientConfig.sheetGid);
    const rows = categoriesData?.table?.rows || [];

    const letterPriceRow = rows.find((row) => String(row?.c?.[11]?.v || "").trim() === lettersConfig.priceRowLabel);
    if (letterPriceRow) {
      lettersConfig.sizes.forEach((size, index) => {
        const rawValue = letterPriceRow.c?.[index + 12]?.v;
        letterState.prices[size] = normalizePrice(rawValue);
      });
    }

    const kitsMap = new Map();
    const individuals = [];

    rows.forEach((row, rowIndex) => {
      const cells = row.c || [];

      const kitFullName = String(cells[0]?.v || "").trim();
      const kitName = String(cells[1]?.v || "").trim();
      const kitMaterial = String(cells[2]?.v || "").trim();
      const kitObject = String(cells[3]?.v || "").trim();
      const kitPrice = Number(cells[4]?.v);

      if (kitFullName && kitName && kitMaterial && kitObject && Number.isFinite(kitPrice)) {
        const familyId = `kit-${slugify(kitName)}`;
        if (!kitsMap.has(familyId)) {
          kitsMap.set(familyId, {
            id: familyId,
            name: kitName,
            type: "kit",
            open: false,
            products: [],
            materialGroups: [],
            sortIndex: rowIndex,
            basePrice: 0,
          });
        }

        const family = kitsMap.get(familyId);
        family.products.push({
          id: `prd-${familyId}-${slugify(kitFullName)}-${rowIndex}`,
          name: kitFullName,
          material: kitMaterial,
          object: kitObject,
          unitPrice: kitPrice,
          sortIndex: rowIndex,
        });
        family.basePrice += kitPrice;
      }

      const individualFullName = String(cells[6]?.v || "").trim();
      const individualObject = String(cells[7]?.v || "").trim();
      const individualMaterial = String(cells[8]?.v || "").trim();
      const individualPrice = Number(cells[9]?.v);

      if (individualFullName && individualMaterial && Number.isFinite(individualPrice)) {
        individuals.push({
          id: `prd-individual-${slugify(individualFullName)}-${rowIndex}`,
          name: individualFullName,
          object: individualObject,
          material: individualMaterial,
          unitPrice: individualPrice,
          sortIndex: rowIndex,
        });
      }
    });

    return [
      {
        id: "kits",
        name: "Kits",
        summaryLabel: "Kits",
        icon: "deployed_code",
        type: "kits",
        families: Array.from(kitsMap.values())
          .map((family) => ({
            ...family,
            products: family.products.sort((a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)),
            materialGroups: groupProductsBy(family.products, "material").map((group) => ({
              id: `mat-${family.id}-${slugify(group.label)}`,
              name: group.label,
              basePrice: group.items.reduce((sum, item) => sum + item.unitPrice, 0),
              products: group.items.sort((a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)),
            })),
          }))
          .sort((a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)),
      },
      {
        id: "individuales",
        name: "Individuales",
        summaryLabel: "Individuales",
        icon: "inventory_2",
        type: "price-list",
        families: [],
        products: individuals.sort((a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)),
      },
      {
        id: "letras",
        name: "Letras",
        summaryLabel: "Letras",
        icon: "title",
        type: "letters",
        families: [],
        products: [],
      },
    ].filter(
      (section) =>
        section.type === "letters" ||
        section.families?.length > 0 ||
        section.products?.length > 0
    );
  }

  if (clientConfig?.catalogMode === "categorized-price-list") {
    const sourceData = await loadSheetData(clientConfig.catalogSheetGid || clientConfig.sheetGid);
    const columns = sourceData?.table?.cols || [];
    const sourceRows = sourceData?.table?.rows || [];
    const indexes = Object.fromEntries(
      columns.map((column, index) => [normalizeSheetLabel(column.label), index])
    );
    const getCell = (cells, label) => {
      const index = indexes[normalizeSheetLabel(label)];
      const value = index === undefined ? "" : cells[index]?.v;
      return value === null || value === undefined ? "" : value;
    };
    const sections = new Map();

    sourceRows.forEach((row, rowIndex) => {
      const cells = row.c || [];
      const sectionName = String(getCell(cells, "Sección")).trim();
      const categoryName = String(getCell(cells, "Categoría")).trim();
      const productName = String(getCell(cells, "Producto")).trim();
      const model = String(getCell(cells, "Modelo")).trim();
      const unitPrice = Number(getCell(cells, "Precio"));
      const active = String(getCell(cells, "Activo")).trim().toLowerCase();

      if (!sectionName || !productName || !Number.isFinite(unitPrice) || ["no", "false", "0"].includes(active)) {
        return;
      }

      const sectionId = `section-${slugify(sectionName)}`;
      if (!sections.has(sectionId)) {
        sections.set(sectionId, {
          id: sectionId,
          name: sectionName,
          summaryLabel: sectionName,
          icon: sectionName.toLowerCase().includes("letra") ? "title" : "inventory_2",
          type: "price-list",
          families: [],
          products: [],
          categoriesMap: new Map(),
          sortIndex: rowIndex,
        });
      }

      const section = sections.get(sectionId);
      const categoryLabel = categoryName || "Otros";
      const categoryId = `category-${sectionId}-${slugify(categoryLabel)}`;
      if (!section.categoriesMap.has(categoryId)) {
        section.categoriesMap.set(categoryId, {
          id: categoryId,
          name: categoryLabel,
          products: [],
          sortIndex: rowIndex,
        });
      }

      const product = {
        id: `prd-${sectionId}-${slugify(categoryLabel)}-${slugify(productName)}-${slugify(model)}-${rowIndex}`,
        name: productName,
        model,
        unitPrice,
        sortIndex: rowIndex,
      };
      section.products.push(product);
      section.categoriesMap.get(categoryId).products.push(product);
    });

    return Array.from(sections.values())
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((section) => ({
        ...section,
        products: section.products.sort((a, b) => a.sortIndex - b.sortIndex),
        categories: Array.from(section.categoriesMap.values())
          .sort((a, b) => a.sortIndex - b.sortIndex)
          .map((category) => ({
            ...category,
            products: category.products.sort((a, b) => a.sortIndex - b.sortIndex),
          })),
      }));
  }

  const data = await loadSheetData(clientConfig.sheetGid);
  const cols = data?.table?.cols || [];
  const rows = data?.table?.rows || [];
  const indexes = Object.fromEntries(cols.map((col, index) => [col.label, index]));
  const normalizedIndexes = Object.fromEntries(
    cols.map((col, index) => [normalizeSheetLabel(col.label), index])
  );

  const getRaw = (cells, labelOrLabels) => {
    const labels = Array.isArray(labelOrLabels) ? labelOrLabels : [labelOrLabels];
    const index = labels.reduce((found, label) => {
      if (found !== undefined) return found;
      if (indexes[label] !== undefined) return indexes[label];
      return normalizedIndexes[normalizeSheetLabel(label)];
    }, undefined);
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
    const rawFamilyName = String(getRaw(cells, "Familia") || "").trim();
    const productName = String(getRaw(cells, "Producto") || "").trim();
    const rawPlates = getRaw(cells, "placas");
    const thickness = String(getRaw(cells, "espesor") || "").trim();
    const type = slugify(getRaw(cells, "tipo"));
    const plates = Number(rawPlates);
    const explicitPlateLabel = String(
      getRaw(cells, ["placa", "placa_corte", "placa de corte", "medida_placa", "medida de placa"]) || ""
    )
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
    const parsedFamilyVariant = parseFamilyPlateVariant(rawFamilyName);
    const familyName = parsedFamilyVariant.familyName || rawFamilyName;
    const plateLabel = explicitPlateLabel || parsedFamilyVariant.plateLabel;

    if (!rawFamilyName || !productName || !Number.isFinite(plates) || !sectionsMap.has(thickness)) {
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
        variantsMap: new Map(),
        sortIndex: rowIndex,
      });
    }

    const family = section.familiesMap.get(familyId);
    const product = {
      id: `prd-${familyId}-${slugify(productName)}-${rowIndex}`,
      name: productName,
      plates,
      sourceFamily: rawFamilyName,
      plateLabel,
      sortIndex: rowIndex,
    };

    if (normalizedType === "grupo" && plateLabel) {
      const variantId = `var-${familyId}-${slugify(plateLabel)}`;
      if (!family.variantsMap.has(variantId)) {
        family.variantsMap.set(variantId, {
          id: variantId,
          plateLabel,
          products: [],
          sortIndex: rowIndex,
        });
      }

      family.variantsMap.get(variantId).products.push(product);
    }

    family.products.push(product);
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
            variants: Array.from(family.variantsMap?.values() || [])
              .map((variant) => ({
                ...variant,
                products: variant.products.sort(
                  (a, b) => a.sortIndex - b.sortIndex || compareText(a.name, b.name)
                ),
              }))
              .sort((a, b) => a.sortIndex - b.sortIndex || compareText(a.plateLabel, b.plateLabel)),
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

  return {
    init,
  };
}

  window.PedidosApp = window.PedidosApp || {};
  window.PedidosApp.createAppController = createAppController;
})();
