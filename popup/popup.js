document.addEventListener("DOMContentLoaded", async () => {
  const currentDomainEl = document.getElementById("current-domain");
  const toggleBtn = document.getElementById("toggle-btn");
  const manageBtn = document.getElementById("manage-btn");
  const backBtn = document.getElementById("back-btn");
  const mainView = document.getElementById("main-view");
  const blacklistView = document.getElementById("blacklist-view");
  const blacklistItemsEl = document.getElementById("blacklist-items");
  const emptyStateEl = document.getElementById("empty-state");

  let currentDomain = "";
  let blacklist = [];
  let blockCounts = {};

  await loadState();
  await loadActiveTab();

  toggleBtn.addEventListener("click", async () => {
    if (!currentDomain || currentDomain === "System Page") {
      return;
    }

    if (blacklist.includes(currentDomain)) {
      blacklist = blacklist.filter((domain) => domain !== currentDomain);
      delete blockCounts[currentDomain];
    } else {
      blacklist.push(currentDomain);
      blacklist = [...new Set(blacklist)].sort();
    }

    await saveState();
    updateToggleButtonState();
    renderBlacklist();
  });

  manageBtn.addEventListener("click", () => {
    mainView.classList.add("hidden");
    blacklistView.classList.remove("hidden");
    renderBlacklist();
  });

  backBtn.addEventListener("click", () => {
    blacklistView.classList.add("hidden");
    mainView.classList.remove("hidden");
    updateToggleButtonState();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.blacklist) {
      blacklist = Array.isArray(changes.blacklist.newValue)
        ? changes.blacklist.newValue.map(normalizeDomain).filter(Boolean).sort()
        : [];
    }

    if (changes.blockCounts) {
      blockCounts =
        changes.blockCounts.newValue && typeof changes.blockCounts.newValue === "object"
          ? changes.blockCounts.newValue
          : {};
    }

    updateToggleButtonState();
    renderBlacklist();
  });

  function normalizeDomain(domain) {
    if (!domain) {
      return "";
    }

    return domain
      .trim()
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
  }

  async function loadState() {
    const data = await chrome.storage.local.get({
      blacklist: [],
      blockCounts: {},
    });

    blacklist = Array.isArray(data.blacklist)
      ? data.blacklist.map(normalizeDomain).filter(Boolean).sort()
      : [];
    blockCounts =
      data.blockCounts && typeof data.blockCounts === "object"
        ? data.blockCounts
        : {};
  }

  async function saveState() {
    await chrome.storage.local.set({ blacklist, blockCounts });
  }

  async function loadActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.url) {
      currentDomainEl.textContent = "Unknown";
      toggleBtn.textContent = "Unsupported Page";
      toggleBtn.disabled = true;
      toggleBtn.className = "button disabled-btn";
      return;
    }

    if (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://")) {
      currentDomain = "System Page";
      currentDomainEl.textContent = currentDomain;
      toggleBtn.textContent = "Cannot Block System Pages";
      toggleBtn.disabled = true;
      toggleBtn.className = "button disabled-btn";
      return;
    }

    try {
      const url = new URL(activeTab.url);
      currentDomain = normalizeDomain(url.hostname);
      currentDomainEl.textContent = currentDomain || "Unknown";
      updateToggleButtonState();
    } catch {
      currentDomainEl.textContent = "Unknown";
      toggleBtn.textContent = "Unsupported Page";
      toggleBtn.disabled = true;
      toggleBtn.className = "button disabled-btn";
    }
  }

  function updateToggleButtonState() {
    if (!currentDomain || currentDomain === "System Page") {
      return;
    }

    toggleBtn.disabled = false;

    if (blacklist.includes(currentDomain)) {
      toggleBtn.textContent = "Remove from Blacklist";
      toggleBtn.className = "button unblock-btn";
    } else {
      toggleBtn.textContent = "Block Popups on this Site";
      toggleBtn.className = "button block-btn";
    }
  }

  function renderBlacklist() {
    blacklistItemsEl.innerHTML = "";

    if (blacklist.length === 0) {
      blacklistItemsEl.classList.add("hidden");
      emptyStateEl.classList.remove("hidden");
      return;
    }

    blacklistItemsEl.classList.remove("hidden");
    emptyStateEl.classList.add("hidden");

    blacklist.forEach((domain) => {
      const li = document.createElement("li");
      li.className = "blacklist-item";

      const domainInfo = document.createElement("div");
      domainInfo.className = "domain-info";

      const countBadge = document.createElement("span");
      countBadge.className = "count-badge";
      countBadge.textContent = String(blockCounts[domain] || 0);
      countBadge.title = "Blocked popup/tab count";

      const domainName = document.createElement("span");
      domainName.className = "domain-name";
      domainName.textContent = domain;

      domainInfo.appendChild(countBadge);
      domainInfo.appendChild(domainName);

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove";

      removeBtn.addEventListener("click", async () => {
        blacklist = blacklist.filter((entry) => entry !== domain);
        delete blockCounts[domain];
        await saveState();
        updateToggleButtonState();
        renderBlacklist();
      });

      li.appendChild(domainInfo);
      li.appendChild(removeBtn);
      blacklistItemsEl.appendChild(li);
    });
  }
});
