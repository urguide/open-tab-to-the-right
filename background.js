// Track the active tab index per window so we know where "to the right" is.
const activeTabIndex = new Map();

// Default settings. focusLeftOnClose can be disabled by the user via the popup.
const DEFAULT_SETTINGS = { focusLeftOnClose: true };

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return stored;
}

// Track the currently active tab id per window so we can tell, on close,
// whether the closed tab was the focused one.
const activeTabId = new Map();

async function rememberActive(windowId, tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    activeTabIndex.set(windowId, tab.index);
    activeTabId.set(windowId, tabId);
  } catch (e) {
    // Tab may have been closed already; ignore.
  }
}

// Keep track of which tab is active in each window.
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  rememberActive(windowId, tabId);
});

// When a tab is closed, if it was the active one, focus the tab to its left.
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const { windowId, isWindowClosing } = removeInfo;
  if (isWindowClosing) {
    return; // The whole window is going away; nothing to refocus.
  }

  const wasActive = activeTabId.get(windowId) === tabId;
  const closedIndex = activeTabIndex.get(windowId);

  // Clean up our records for the closed tab.
  if (wasActive) {
    activeTabId.delete(windowId);
  }

  if (!wasActive || typeof closedIndex !== "number") {
    return; // A background tab was closed; Chrome keeps focus as-is.
  }

  // Respect the user's setting for this feature.
  const { focusLeftOnClose } = await getSettings();
  if (!focusLeftOnClose) {
    return;
  }

  // The tab to the left now occupies closedIndex - 1.
  const leftIndex = closedIndex - 1;
  if (leftIndex < 0) {
    return; // The closed tab was the leftmost; nothing to the left.
  }

  try {
    const tabs = await chrome.tabs.query({ windowId, index: leftIndex });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
    }
  } catch (e) {
    // Window may be gone or index invalid; ignore.
  }
});

// When a new tab is created, move it to the right of the active tab.
chrome.tabs.onCreated.addListener(async (tab) => {
  // Tabs opened via "open in new tab" usually set openerTabId; we still
  // reposition all newly created tabs so behaviour is consistent.
  const windowId = tab.windowId;

  // Determine the reference index: the opener tab if present, otherwise the
  // last known active tab in this window.
  let referenceIndex;
  if (typeof tab.openerTabId === "number") {
    try {
      const opener = await chrome.tabs.get(tab.openerTabId);
      referenceIndex = opener.index;
    } catch (e) {
      referenceIndex = activeTabIndex.get(windowId);
    }
  } else {
    referenceIndex = activeTabIndex.get(windowId);
  }

  if (typeof referenceIndex !== "number") {
    return; // No reference; leave the tab where Chrome put it.
  }

  const targetIndex = referenceIndex + 1;

  // If Chrome already placed it correctly, do nothing.
  if (tab.index === targetIndex) {
    return;
  }

  try {
    await chrome.tabs.move(tab.id, { index: targetIndex });
  } catch (e) {
    // Moving can fail for pinned tabs or race conditions; ignore.
  }
});

// Initialise the active-tab map on startup/install.
async function init() {
  const tabs = await chrome.tabs.query({ active: true });
  for (const tab of tabs) {
    activeTabIndex.set(tab.windowId, tab.index);
    activeTabId.set(tab.windowId, tab.id);
  }
}

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);
init();
