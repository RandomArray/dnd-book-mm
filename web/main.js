const API_BASE = "/api";

const groupsEl = document.getElementById("groups");
const typeFilterEl = document.getElementById("typeFilter");
const alignmentFilterEl = document.getElementById("alignmentFilter");
const searchEl = document.getElementById("search");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const favoritesOnlyBtn = document.getElementById("favoritesOnlyBtn");
const favoritesCountEl = document.getElementById("favoritesCount");
const favoritesListEl = document.getElementById("favoritesList");
const clearFavoritesBtn = document.getElementById("clearFavoritesBtn");
const confirmClearDialog = document.getElementById("confirmClearDialog");
const statTotalMonstersEl = document.getElementById("statTotalMonsters");
const statTotalTypesEl = document.getElementById("statTotalTypes");
const statToughestEl = document.getElementById("statToughest");
const statTopAlignmentEl = document.getElementById("statTopAlignment");
const groupTemplate = document.getElementById("groupTemplate");
const cardTemplate = document.getElementById("cardTemplate");

const FAVORITES_STORAGE_KEY = "omm:favorites:v1";
let favoritesOnly = false;
let pendingFocusMonsterId = null;
const knownAlignments = new Set();

function alignmentValue(row) {
  const raw = String(row?.stats?.alignment || "").trim();
  return raw || "Unknown";
}

function renderAlignmentOptions() {
  const selected = alignmentFilterEl.value;
  alignmentFilterEl.innerHTML = '<option value="">All Alignments</option>';

  Array.from(knownAlignments)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      alignmentFilterEl.appendChild(option);
    });

  alignmentFilterEl.value = knownAlignments.has(selected) ? selected : "";
}

function collectAlignments(rows) {
  let changed = false;
  rows.forEach((row) => {
    const value = alignmentValue(row);
    if (!knownAlignments.has(value)) {
      knownAlignments.add(value);
      changed = true;
    }
  });

  if (changed) {
    renderAlignmentOptions();
  }
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      return {};
    }

    return list.reduce((acc, item) => {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string") {
        return acc;
      }

      acc[item.id] = {
        id: item.id,
        name: item.name,
        type: String(item.type || "Unknown"),
        source: String(item.source || "Unknown"),
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
}

let favoritesById = loadFavorites();

function saveFavorites() {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Object.values(favoritesById)));
}

function monsterId(monster) {
  return `${String(monster.type || "").trim().toLowerCase()}::${String(monster.name || "")
    .trim()
    .toLowerCase()}`;
}

function isFavorite(monster) {
  return Boolean(favoritesById[monsterId(monster)]);
}

function setFavoritesOnlyButtonState() {
  favoritesOnlyBtn.setAttribute("aria-pressed", String(favoritesOnly));
  favoritesOnlyBtn.setAttribute(
    "aria-label",
    favoritesOnly ? "Show all monsters" : "Show favorites only",
  );
  favoritesOnlyBtn.setAttribute(
    "title",
    favoritesOnly ? "Show all monsters" : "Show favorites only",
  );
  favoritesOnlyBtn.innerHTML = favoritesOnly
    ? '<span class="btn-icon" aria-hidden="true">☰</span><span class="btn-label">All</span>'
    : '<span class="btn-icon" aria-hidden="true">★</span><span class="btn-label">Favorites</span>';
}

function renderFavoritesManager() {
  const favorites = Object.values(favoritesById).sort((a, b) => a.name.localeCompare(b.name));
  favoritesCountEl.textContent = String(favorites.length);
  clearFavoritesBtn.disabled = favorites.length === 0;
  favoritesListEl.innerHTML = "";

  if (!favorites.length) {
    favoritesListEl.innerHTML = '<li class="favorites-empty">No favorites yet.</li>';
    return;
  }

  favorites.forEach((item) => {
    const li = document.createElement("li");
    li.className = "favorite-item";

    const jumpBtn = document.createElement("button");
    jumpBtn.type = "button";
    jumpBtn.className = "favorite-jump";
    jumpBtn.innerHTML = `<span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.type)}</small>`;
    jumpBtn.addEventListener("click", () => {
      searchEl.value = item.name;
      typeFilterEl.value = "";
      alignmentFilterEl.value = "";
      favoritesOnly = false;
      pendingFocusMonsterId = item.id;
      setFavoritesOnlyButtonState();
      loadMonsters();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "favorite-remove";
    removeBtn.innerHTML = '<span aria-hidden="true">✕</span>';
    removeBtn.setAttribute("aria-label", `Remove ${item.name} from favorites`);
    removeBtn.title = "Remove from favorites";
    removeBtn.addEventListener("click", () => {
      delete favoritesById[item.id];
      saveFavorites();
      renderFavoritesManager();
      loadMonsters();
    });

    li.appendChild(jumpBtn);
    li.appendChild(removeBtn);
    favoritesListEl.appendChild(li);
  });
}

function applyFavoriteButtonState(buttonEl, state) {
  buttonEl.setAttribute("aria-pressed", String(state));
  buttonEl.textContent = state ? "★" : "☆";
  buttonEl.title = state ? "Remove from favorites" : "Add to favorites";
  buttonEl.setAttribute("aria-label", state ? "Remove from favorites" : "Add to favorites");
  buttonEl.classList.toggle("is-favorite", state);
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHref(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim(), window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function inlineMarkdown(text) {
  const source = String(text || "");
  let out = "";
  let cursor = 0;
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  const formatInline = (chunk) =>
    escapeHtml(chunk)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  while ((match = linkPattern.exec(source)) !== null) {
    const [full, label, url] = match;
    out += formatInline(source.slice(cursor, match.index));
    const href = safeHref(url);
    if (href) {
      out += `<a class="summary-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${formatInline(label)}</a>`;
    } else {
      out += formatInline(full);
    }
    cursor = match.index + full.length;
  }

  out += formatInline(source.slice(cursor));
  return out;
}

function markdownToHtml(markdown) {
  const normalized = String(markdown || "").replaceAll("_", " ");
  const lines = normalized.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      blocks.push(`</${listType}>`);
      listType = null;
    }
  };

  lines.forEach((line) => {
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);

    if (!line.trim()) {
      closeList();
      return;
    }

    if (unordered) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        blocks.push("<ul>");
      }
      blocks.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      return;
    }

    if (ordered) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        blocks.push("<ol>");
      }
      blocks.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      return;
    }

    closeList();
    blocks.push(`<p>${inlineMarkdown(line)}</p>`);
  });

  closeList();
  return blocks.join("");
}

function parseHitDice(hdText) {
  const cleaned = String(hdText || "").trim().toLowerCase();
  const fractionMatch = cleaned.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    return Number(fractionMatch[1]) / Number(fractionMatch[2]);
  }

  const numericStart = cleaned.match(/^\d+/);
  if (numericStart) {
    return Number(numericStart[0]);
  }

  return 0;
}

function updateStats(rows) {
  const total = rows.length;
  const uniqueTypes = new Set(rows.map((row) => row.type)).size;

  let toughest = null;
  for (const row of rows) {
    const score = parseHitDice(row.stats.hd);
    if (!toughest || score > toughest.score) {
      toughest = { name: row.name, score };
    }
  }

  const alignmentCounts = rows.reduce((acc, row) => {
    const key = row.stats.alignment || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topAlignment = Object.entries(alignmentCounts).sort((a, b) => b[1] - a[1])[0];

  statTotalMonstersEl.textContent = total;
  statTotalTypesEl.textContent = uniqueTypes;
  statToughestEl.textContent = toughest ? `${toughest.name} (${toughest.score} HD)` : "--";
  statTopAlignmentEl.textContent = topAlignment
    ? `${topAlignment[0]} (${topAlignment[1]})`
    : "--";
}

function statEntries(stats) {
  return [
    ["#", stats.groupNumber],
    ["AC", stats.ac],
    ["HD", stats.hd],
    ["Atk", stats.attacks],
    ["Mv", stats.movement],
    ["Mor", stats.morale],
    ["Aln", stats.alignment],
  ];
}

function renderGroups(rows) {
  groupsEl.innerHTML = "";
  let focusedCardEl = null;

  const byType = rows.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {});

  Object.keys(byType)
    .sort((a, b) => a.localeCompare(b))
    .forEach((typeName) => {
      const groupNode = groupTemplate.content.cloneNode(true);
      groupNode.querySelector(".group-title").textContent = typeName;
      const groupToggleEl = groupNode.querySelector(".group-toggle");
      const groupIndicatorEl = groupNode.querySelector(".group-indicator");
      const cardsEl = groupNode.querySelector(".cards");

      groupToggleEl.setAttribute("aria-expanded", "false");
      groupIndicatorEl.textContent = "+";
      cardsEl.hidden = true;

      groupToggleEl.addEventListener("click", () => {
        const isOpen = groupToggleEl.getAttribute("aria-expanded") === "true";
        groupToggleEl.setAttribute("aria-expanded", String(!isOpen));
        cardsEl.hidden = isOpen;
        groupIndicatorEl.textContent = isOpen ? "+" : "-";
      });

      byType[typeName].forEach((monster) => {
        const cardNode = cardTemplate.content.cloneNode(true);
        const cardEl = cardNode.querySelector(".card");
        cardNode.querySelector(".name").textContent = `${monster.groupNumber}. ${monster.name}`;
        const toggleBtn = cardNode.querySelector(".name-toggle");
        const favoriteBtn = cardNode.querySelector(".favorite-btn");
        const detailsEl = cardNode.querySelector(".details");
        const indicatorEl = cardNode.querySelector(".toggle-indicator");

        toggleBtn.addEventListener("click", () => {
          const isOpen = toggleBtn.getAttribute("aria-expanded") === "true";
          toggleBtn.setAttribute("aria-expanded", String(!isOpen));
          detailsEl.hidden = isOpen;
          indicatorEl.textContent = isOpen ? "+" : "-";
        });

        const summaryEl = cardNode.querySelector(".summary");
        summaryEl.innerHTML = markdownToHtml(monster.summary);

        const favoriteState = isFavorite(monster);
        applyFavoriteButtonState(favoriteBtn, favoriteState);
        favoriteBtn.addEventListener("click", () => {
          const id = monsterId(monster);
          let nextState = true;
          if (favoritesById[id]) {
            delete favoritesById[id];
            nextState = false;
          } else {
            favoritesById[id] = {
              id,
              name: monster.name,
              type: monster.type,
              source: monster.source,
            };
          }

          applyFavoriteButtonState(favoriteBtn, nextState);
          saveFavorites();
          renderFavoritesManager();
          if (favoritesOnly && !nextState) {
            loadMonsters();
          }
        });

        const sourceRow = document.createElement("p");
        sourceRow.className = "source-row";
        const sourceLink = document.createElement("a");
        sourceLink.className = "source-link";
        sourceLink.textContent = `Source: ${monster.source}`;
        const href = safeHref(monster.sourceUrl);
        if (href) {
          sourceLink.href = href;
          sourceLink.target = "_blank";
          sourceLink.rel = "noreferrer noopener";
        }
        sourceRow.appendChild(sourceLink);
        detailsEl.insertBefore(sourceRow, cardNode.querySelector(".stats"));

        const statsEl = cardNode.querySelector(".stats");
        statEntries({ ...monster.stats, groupNumber: monster.groupNumber }).forEach(([k, v]) => {
          const wrapper = document.createElement("div");
          const dt = document.createElement("dt");
          const dd = document.createElement("dd");
          dt.textContent = k;
          dd.textContent = v;
          wrapper.appendChild(dt);
          wrapper.appendChild(dd);
          statsEl.appendChild(wrapper);
        });

        if (pendingFocusMonsterId && pendingFocusMonsterId === monsterId(monster)) {
          groupToggleEl.setAttribute("aria-expanded", "true");
          cardsEl.hidden = false;
          groupIndicatorEl.textContent = "-";
          toggleBtn.setAttribute("aria-expanded", "true");
          detailsEl.hidden = false;
          indicatorEl.textContent = "-";
          focusedCardEl = cardEl;
        }

        cardsEl.appendChild(cardNode);
      });

      groupsEl.appendChild(groupNode);
    });

  if (!rows.length) {
    groupsEl.innerHTML = "<p>No monsters match the current filters.</p>";
  }

  if (focusedCardEl) {
    requestAnimationFrame(() => {
      focusedCardEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  pendingFocusMonsterId = null;
}

async function loadTypes() {
  const res = await fetch(`${API_BASE}/monster-types`);
  const types = await res.json();

  types.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.name;
    option.textContent = row.name;
    typeFilterEl.appendChild(option);
  });
}

async function loadMonsters() {
  const params = new URLSearchParams();
  if (typeFilterEl.value) {
    params.set("monster_type", typeFilterEl.value);
  }
  if (searchEl.value.trim()) {
    params.set("search", searchEl.value.trim());
  }

  const res = await fetch(`${API_BASE}/monsters?${params.toString()}`);
  const rows = await res.json();
  collectAlignments(rows);

  let visibleRows = favoritesOnly ? rows.filter((row) => isFavorite(row)) : rows;
  if (alignmentFilterEl.value) {
    visibleRows = visibleRows.filter((row) => alignmentValue(row) === alignmentFilterEl.value);
  }

  updateStats(visibleRows);
  renderGroups(visibleRows);
}

function resetFilters() {
  searchEl.value = "";
  typeFilterEl.value = "";
  alignmentFilterEl.value = "";
  favoritesOnly = false;
  setFavoritesOnlyButtonState();
  loadMonsters();
}

resetFiltersBtn.addEventListener("click", resetFilters);
searchEl.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter") {
    loadMonsters();
  }
});
typeFilterEl.addEventListener("change", loadMonsters);
alignmentFilterEl.addEventListener("change", loadMonsters);

favoritesOnlyBtn.addEventListener("click", () => {
  const wasFavoritesOnly = favoritesOnly;
  favoritesOnly = !favoritesOnly;

  if (wasFavoritesOnly && !favoritesOnly && searchEl.value.trim()) {
    searchEl.value = "";
  }

  setFavoritesOnlyButtonState();
  loadMonsters();
});

clearFavoritesBtn.addEventListener("click", () => {
  if (confirmClearDialog && typeof confirmClearDialog.showModal === "function") {
    confirmClearDialog.showModal();
    return;
  }

  if (window.confirm("Clear all favorites?")) {
    favoritesById = {};
    saveFavorites();
    renderFavoritesManager();
    loadMonsters();
  }
});

if (confirmClearDialog) {
  confirmClearDialog.addEventListener("close", () => {
    if (confirmClearDialog.returnValue !== "confirm") {
      return;
    }

    favoritesById = {};
    saveFavorites();
    renderFavoritesManager();
    loadMonsters();
  });
}

setFavoritesOnlyButtonState();
renderFavoritesManager();

loadTypes().then(loadMonsters).catch((err) => {
  groupsEl.innerHTML = `<p>Failed to load data: ${err.message}</p>`;
});
