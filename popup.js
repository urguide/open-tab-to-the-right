// Fill in localized text for every element marked with data-i18n.
for (const el of document.querySelectorAll("[data-i18n]")) {
  const msg = chrome.i18n.getMessage(el.dataset.i18n);
  if (msg) {
    el.textContent = msg;
  }
}

const DEFAULT_SETTINGS = { focusLeftOnClose: true };
const checkbox = document.getElementById("focusLeftOnClose");

// Load the saved setting and reflect it in the checkbox.
chrome.storage.sync.get(DEFAULT_SETTINGS).then((settings) => {
  checkbox.checked = settings.focusLeftOnClose;
});

// Persist changes immediately when the user toggles the checkbox.
checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({ focusLeftOnClose: checkbox.checked });
});
