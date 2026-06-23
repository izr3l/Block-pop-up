const STORAGE_DEFAULTS = {
  blacklist: [],
  blockCounts: {},
};

const handledTargets = new Set();

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

function getHostname(urlString) {
  try {
    const url = new URL(urlString);
    return normalizeDomain(url.hostname);
  } catch {
    return "";
  }
}

function findMatchingRule(hostname, blacklist) {
  const normalizedHostname = normalizeDomain(hostname);

  return (
    blacklist.find((entry) => {
      const normalizedEntry = normalizeDomain(entry);
      return (
        normalizedHostname === normalizedEntry ||
        normalizedHostname.endsWith(`.${normalizedEntry}`)
      );
    }) || null
  );
}

function reserveTarget(targetKey) {
  if (!targetKey) {
    return true;
  }

  if (handledTargets.has(targetKey)) {
    return false;
  }

  handledTargets.add(targetKey);
  setTimeout(() => handledTargets.delete(targetKey), 10000);
  return true;
}

let cachedBlacklist = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blacklist) {
    cachedBlacklist = Array.isArray(changes.blacklist.newValue)
      ? changes.blacklist.newValue.map(normalizeDomain).filter(Boolean)
      : [];
  }
});

async function getBlacklist() {
  if (cachedBlacklist !== null) {
    return cachedBlacklist;
  }
  const data = await chrome.storage.local.get("blacklist");
  cachedBlacklist = Array.isArray(data.blacklist)
    ? data.blacklist.map(normalizeDomain).filter(Boolean)
    : [];
  return cachedBlacklist;
}

async function loadBlockSettings() {
  const data = await chrome.storage.local.get(STORAGE_DEFAULTS);
  return {
    blacklist: await getBlacklist(),
    blockCounts:
      data.blockCounts && typeof data.blockCounts === "object"
        ? data.blockCounts
        : {},
  };
}

async function incrementBlockCount(ruleDomain) {
  const { blockCounts } = await loadBlockSettings();
  const normalizedRule = normalizeDomain(ruleDomain);
  const nextCounts = {
    ...blockCounts,
    [normalizedRule]: (blockCounts[normalizedRule] || 0) + 1,
  };

  await chrome.storage.local.set({ blockCounts: nextCounts });
}

async function blockOpenedTarget({ openerTabId, tabId, windowId, targetLabel }) {
  const targetKey = tabId ? `tab:${tabId}` : windowId ? `window:${windowId}` : "";
  if (!reserveTarget(targetKey)) {
    return;
  }

  try {
    const blacklist = await getBlacklist();
    if (blacklist.length === 0) {
      handledTargets.delete(targetKey);
      return;
    }

    const openerTab = await chrome.tabs.get(openerTabId);
    const openerDomain = openerTab?.url ? getHostname(openerTab.url) : "";
    if (!openerDomain) {
      handledTargets.delete(targetKey);
      return;
    }

    const matchedRule = findMatchingRule(openerDomain, blacklist);
    if (!matchedRule) {
      handledTargets.delete(targetKey);
      return;
    }

    if (windowId) {
      await chrome.windows.remove(windowId);
    } else if (tabId) {
      await chrome.tabs.remove(tabId);
    }

    await incrementBlockCount(matchedRule);
    console.log(`Blocked ${targetLabel} from blacklisted domain: ${matchedRule}`);
  } catch (error) {
    handledTargets.delete(targetKey);
    console.error(`Error checking ${targetLabel}:`, error);
  }
}

async function getPopupTab(windowId) {
  const attempts = 5;
  const delayMs = 150;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tabs = await chrome.tabs.query({ windowId });
    const popupTab = tabs.find((tab) => tab.openerTabId);
    if (popupTab) {
      return popupTab;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}

chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.openerTabId || !tab.id) {
    return;
  }

  void blockOpenedTarget({
    openerTabId: tab.openerTabId,
    tabId: tab.id,
    targetLabel: "new tab",
  });
});

chrome.windows.onCreated.addListener((window) => {
  if (window.type !== "popup" || !window.id) {
    return;
  }

  void (async () => {
    try {
      const popupTab = await getPopupTab(window.id);
      if (!popupTab?.openerTabId) {
        return;
      }

      await blockOpenedTarget({
        openerTabId: popupTab.openerTabId,
        tabId: popupTab.id,
        windowId: window.id,
        targetLabel: "popup window",
      });
    } catch (error) {
      console.error("Error checking popup window:", error);
    }
  })();
});
