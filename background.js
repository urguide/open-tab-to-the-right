// Track, per window, which tab is active and what index it sits at, so we know
// where "to the left" is when a tab is closed.
//
// State is kept in chrome.storage.session rather than in-memory variables: an
// MV3 service worker is suspended when idle, which would wipe in-memory state
// and make tab-close focusing fall back to Chrome's default (jumping to the
// last-used tab). session storage survives suspension and is cleared when the
// browser closes.

// Default settings. focusLeftOnClose is off by default; the user can enable it
// via the popup.
const DEFAULT_SETTINGS = { focusLeftOnClose: false };
const SESSION_INITIALIZED_KEY = "sessionInitialized";
const STARTUP_MODE_UNTIL_KEY = "startupModeUntil";
// During browser startup Chrome replays the previous session by firing
// onCreated for every restored tab. While in "startup mode" we move no tabs at
// all, so a restored tab is never dragged out of the order Chrome is rebuilding.
//
// We can't use setTimeout to detect "restore finished": an MV3 service worker is
// suspended when idle, which would kill the timer. Instead each restored tab
// pushes a deadline to now + STARTUP_QUIET_MS; once a gap of that length passes
// with no new tab, the next onCreated sees the deadline expired and treats
// startup as over. A tab created with an openerTabId (an explicit user action,
// e.g. opening a link in a new tab) ends startup mode immediately.
const STARTUP_QUIET_MS = 1200;

// Resolves once init() has run for the current worker lifetime. onCreated awaits
// this so a restored tab created while the worker is still starting up can never
// be repositioned before the restore-suppression window has been written.
let initPromise;

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

// True if this tab was created by session restore rather than a user action.
// Restored tabs are created lazily: they arrive discarded/unloaded and only
// load when clicked. Tabs from user actions (Ctrl+T, links, bookmarks) are
// created loading immediately, so they never match.
function isRestoredTab(tab) {
  return tab.discarded === true || tab.status === "unloaded";
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

// Enter (or extend) startup mode: while active, onCreated moves no tabs.
async function armStartupMode() {
  await chrome.storage.session.set({
    [STARTUP_MODE_UNTIL_KEY]: Date.now() + STARTUP_QUIET_MS,
  });
}

// Leave startup mode immediately.
async function endStartupMode() {
  await chrome.storage.session.remove(STARTUP_MODE_UNTIL_KEY);
}

// True while the browser still appears to be replaying its restored session.
// Each call within the quiet window pushes the deadline out, so a slow restore
// (many tabs) stays suppressed for as long as tabs keep arriving. Once a gap of
// STARTUP_QUIET_MS passes with no new tab, this returns false and clears the
// flag — startup is considered over.
async function isInStartupMode() {
  const res = await chrome.storage.session.get(STARTUP_MODE_UNTIL_KEY);
  const until = res[STARTUP_MODE_UNTIL_KEY];
  if (typeof until !== "number") {
    return false;
  }

  if (Date.now() <= until) {
    await armStartupMode();
    return true;
  }

  await endStartupMode();
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
  // Restored tabs are created discarded/unloaded, unlike any tab a user action
  // creates (Ctrl+T, links, bookmarks), so we can skip them outright. This
  // property-based check is what actually protects session restore; the timing
  // heuristic below is only a best-effort extra guard.
  if (isRestoredTab(tab)) {
    return;
  }

  // While in startup mode we additionally move nothing at all, so even a
  // restored tab that slipped past the check above keeps its position.
  const hasOpener = tab.openerTabId != null;
  const inStartup = await isInStartupMode();
  if (hasOpener) {
    // A tab opened from a link/JS carries an opener — an explicit user action,
    // never a session-restore tab. Treat it as the end of startup and reposition
    // it normally.
    if (inStartup) {
      await endStartupMode();
    }
  } else if (inStartup) {
    return; // A restored tab (or the very first new tab during restore); leave it.
  }

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
//
// session storage is empty whenever the browser has just started (it is cleared
// when the browser closes). That is exactly when Chrome replays the previous
// session by firing onCreated for every restored tab, so the *first* run of a
// worker lifetime must enter startup mode BEFORE it records any active-tab
// reference. Otherwise an onCreated for a restored tab could read the freshly
// written reference and move the tab to the right of it, dragging one tab to the
// front of the bar on every launch.
async function init() {
  const res = await chrome.storage.session.get(SESSION_INITIALIZED_KEY);
  const firstRunThisSession = !res[SESSION_INITIALIZED_KEY];

  if (firstRunThisSession) {
    // Enter startup mode first and mark the session initialised, so any onCreated
    // already waiting on initPromise sees startup mode as soon as it resumes —
    // before we populate the active-tab references below.
    await armStartupMode();
    await chrome.storage.session.set({ [SESSION_INITIALIZED_KEY]: true });
  }

  const tabs = await chrome.tabs.query({ active: true });
  for (const tab of tabs) {
    await setActive(tab.windowId, tab.id, tab.index);
  }
}

chrome.runtime.onStartup.addListener(() => {
  // A real browser launch: guarantee startup mode is armed even if session
  // storage somehow survived, since onStartup only fires on a genuine restore.
  initPromise = (async () => {
    await armStartupMode();
    await init();
  })();
});
chrome.runtime.onInstalled.addListener(() => {
  initPromise = init();
});
initPromise = init();
