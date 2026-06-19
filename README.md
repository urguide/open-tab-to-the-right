# Open Tab to the Right

A tiny, privacy-friendly Chrome extension (Manifest V3) that keeps your tab bar
tidy:

1. **New tab on the right** — new tabs always open immediately to the right of
   the current tab.
2. **Focus left on close** (optional) — when you close the active tab, focus
   moves to the tab on its left. Toggle it from the toolbar popup.

No accounts, no tracking, no data ever leaves your device.

## Install (development)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

## Usage

- New tabs are repositioned automatically — nothing to configure.
- Click the toolbar icon to toggle "Focus left on close".

## Localization

UI and store text are available in:

- English (`en`, default)
- Traditional Chinese (`zh_TW`)
- Simplified Chinese (`zh_CN`)
- Japanese (`ja`)

## Permissions

| Permission | Why |
|-----------|-----|
| `tabs`    | Read tab positions; move/focus tabs. Page contents are never read. |
| `storage` | Persist the single on/off preference for "focus left on close". |

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Project structure

```
manifest.json          Extension manifest (MV3)
background.js          Service worker: tab positioning + focus logic
popup.html / popup.js  Settings popup
icon-*.png / icon.svg  Toolbar / store icons
_locales/              Translations (en, zh_TW, zh_CN, ja)
store-assets/          Screenshots & promo tile for the Web Store
STORE_LISTING.md       Copy/paste listing text & permission justifications
package.sh             Builds a store-ready zip in dist/
```

## Packaging for the Chrome Web Store

```bash
./package.sh
```

This produces `dist/open-tab-to-the-right.zip` containing only the files the
store needs. Upload that zip in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole/).

## License

MIT
