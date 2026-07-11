const API_BASE = "/api";

const groupsEl = document.getElementById("groups");
const typeFilterEl = document.getElementById("typeFilter");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");
const statTotalMonstersEl = document.getElementById("statTotalMonsters");
const statTotalTypesEl = document.getElementById("statTotalTypes");
const statToughestEl = document.getElementById("statToughest");
const statTopAlignmentEl = document.getElementById("statTopAlignment");
const groupTemplate = document.getElementById("groupTemplate");
const cardTemplate = document.getElementById("cardTemplate");

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
        cardNode.querySelector(".name").textContent = `${monster.groupNumber}. ${monster.name}`;
        const toggleBtn = cardNode.querySelector(".name-toggle");
        const detailsEl = cardNode.querySelector(".details");
        const indicatorEl = cardNode.querySelector(".toggle-indicator");

        toggleBtn.addEventListener("click", () => {
          const isOpen = toggleBtn.getAttribute("aria-expanded") === "true";
          toggleBtn.setAttribute("aria-expanded", String(!isOpen));
          detailsEl.hidden = isOpen;
          indicatorEl.textContent = isOpen ? "+" : "-";
        });

        const summaryEl = cardNode.querySelector(".summary");
        summaryEl.textContent = `${monster.summary}`;

        const sourceLink = document.createElement("a");
        sourceLink.href = monster.sourceUrl || "#";
        sourceLink.target = "_blank";
        sourceLink.rel = "noreferrer noopener";
        sourceLink.textContent = `Source: ${monster.source}`;
        sourceLink.className = "source-link";
        if (!monster.sourceUrl) {
          sourceLink.removeAttribute("href");
        }
        summaryEl.appendChild(document.createTextNode(" "));
        summaryEl.appendChild(sourceLink);

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

        cardsEl.appendChild(cardNode);
      });

      groupsEl.appendChild(groupNode);
    });

  if (!rows.length) {
    groupsEl.innerHTML = "<p>No monsters match the current filters.</p>";
  }
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
  updateStats(rows);
  renderGroups(rows);
}

refreshBtn.addEventListener("click", loadMonsters);
searchEl.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter") {
    loadMonsters();
  }
});
typeFilterEl.addEventListener("change", loadMonsters);

loadTypes().then(loadMonsters).catch((err) => {
  groupsEl.innerHTML = `<p>Failed to load data: ${err.message}</p>`;
});
