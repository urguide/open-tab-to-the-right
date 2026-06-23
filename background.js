// Track, per window, which tab is active and what index it sits at, so we know
// where "to the left" is when a tab is closed.
//
// State is kept in chrome.storage.session rather than in-memory variables: an
// MV3 service worker is suspended when idle, which would wipe in-memory state
// and make tab-close focusing fall back to Chrome's default (jumping to the
// last-used tab). session storage survives suspension and is cleared when the
// browser closes.

// Default settings. focusLeftOnClose can be disabled by the user via the popup.
const DEFAULT_SETTINGS = { focusLeftOnClose: true };
const SESSION_INITIALIZED_KEY = "sessionInitialized";
const RESTORE_SUPPRESSION_UNTIL_KEY = "restoreSuppressionUntil";
const RESTORE_SUPPRESSION_MS = 3000;

// Resolves once init() has run for the current worker lifetime. onCreated awaits
// this so a restored tab created while the worker is still starting up can never
// be repositioned before the restore-suppression window has been written.
let initPromise;

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

// One session-storage key per window, holding { id, index } of its active tab.
function keyFor(windowId) {
  return `active_${windowId}`;
}

async function getActive(windowId) {
  const key = keyFor(windowId);
  const res = await chrome.storage.session.get(key);
  return res[key];
}

async function setActive(windowId, id, index) {
  await chrome.storage.session.set({ [keyFor(windowId)]: { id, index } });
}

async function extendRestoreSuppression() {
  await chrome.storage.session.set({
    [RESTORE_SUPPRESSION_UNTIL_KEY]: Date.now() + RESTORE_SUPPRESSION_MS,
  });
}

async function shouldSuppressCreatedMove() {
  const res = await chrome.storage.session.get(RESTORE_SUPPRESSION_UNTIL_KEY);
  const until = res[RESTORE_SUPPRESSION_UNTIL_KEY];
  if (typeof until !== "number") {
    return false;
  }

  if (Date.now() <= until) {
    await extendRestoreSuppression();
    return true;
  }

  await chrome.storage.session.remove(RESTORE_SUPPRESSION_UNTIL_KEY);
  return false;
}

async function rememberActive(windowId, tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await setActive(windowId, tab.id, tab.index);
  } catch (e) {
    // Tab may have been closed already; ignore.
  }
}

// Re-read the active tab's current index from Chrome and persist it. Called
// after events that can shift the active tab's index (a move, or a background
// tab closing to its left) so the stored index stays accurate for the moment
// the active tab itself is eventually closed.
async function refreshActiveIndex(windowId) {
  const active = await getActive(windowId);
  if (!active) {
    return;
  }
  try {
    const tab = await chrome.tabs.get(active.id);
    if (tab.windowId === windowId) {
      await setActive(windowId, tab.id, tab.index);
    }
  } catch (e) {
    // Active tab is gone; the onRemoved handler will deal with it.
  }
}

// Keep track of which tab is active in each window.
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  rememberActive(windowId, tabId);
});

// Reordering a tab can change the active tab's index; keep our record fresh.
chrome.tabs.onMoved.addListener((tabId, { windowId }) => {
  refreshActiveIndex(windowId);
});

// Moving a tab between windows likewise shifts indices on both sides.
chrome.tabs.onAttached.addListener((tabId, { newWindowId }) => {
  refreshActiveIndex(newWindowId);
});
chrome.tabs.onDetached.addListener((tabId, { oldWindowId }) => {
  refreshActiveIndex(oldWindowId);
});

// When a tab is closed, if it was the active one, focus the tab to its left.
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const { windowId, isWindowClosing } = removeInfo;
  if (isWindowClosing) {
    return; // The whole window is going away; nothing to refocus.
  }

  const active = await getActive(windowId);
  if (!active) {
    return; // Unknown active tab; let Chrome decide.
  }

  if (active.id !== tabId) {
    // A background tab closed. If it sat to the left of the active tab, the
    // active tab's index has shifted down by one; re-sync our record.
    await refreshActiveIndex(windowId);
    return; // Chrome keeps focus on the still-active tab.
  }

  // The active tab was closed. Clear our record for it.
  await chrome.storage.session.remove(keyFor(windowId));

  const closedIndex = active.index;
  if (typeof closedIndex !== "number") {
    return;
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
  // Wait for startup initialisation to finish so the restore-suppression window
  // is guaranteed to be in place before we decide whether to move this tab. The
  // worker can be woken by a restored tab's onCreated before init() has written
  // the suppression flag; without this await that tab would be repositioned.
  await initPromise?.catch(() => {});

  // Chrome rebuilds the previous session by firing onCreated for restored tabs.
  // Moving those tabs during startup corrupts the order Chrome is restoring.
  if (await shouldSuppressCreatedMove()) {
    return;
  }

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
      const active = await getActive(windowId);
      referenceIndex = active && active.index;
    }
  } else {
    const active = await getActive(windowId);
    referenceIndex = active && active.index;
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

// Initialise the active-tab records on startup/install.
async function init() {
  const res = await chrome.storage.session.get(SESSION_INITIALIZED_KEY);
  if (!res[SESSION_INITIALIZED_KEY]) {
    await extendRestoreSuppression();
  }

  const tabs = await chrome.tabs.query({ active: true });
  for (const tab of tabs) {
    await setActive(tab.windowId, tab.id, tab.index);
  }

  await chrome.storage.session.set({ [SESSION_INITIALIZED_KEY]: true });
}

chrome.runtime.onStartup.addListener(() => {
  initPromise = init();
});
chrome.runtime.onInstalled.addListener(() => {
  initPromise = init();
});
initPromise = init();
