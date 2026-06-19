# Open Tab to the Right

**English** | [繁體中文](#在右側開啟分頁)

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

---

# 在右側開啟分頁

[English](#open-tab-to-the-right) | **繁體中文**

一個輕量、注重隱私的 Chrome 擴充功能（Manifest V3），讓你的分頁列保持整齊：

1. **新分頁開在右邊** — 新分頁一律緊鄰目前分頁的右側打開。
2. **關閉後焦點往左**（可選）— 關閉目前分頁時，焦點移到左邊的分頁。可從工具列彈出視窗開關。

無帳號、無追蹤，分頁相關資料完全不離開你的裝置。

## 安裝（開發模式）

1. 開啟 `chrome://extensions/`
2. 開啟右上角的 **開發人員模式**
3. 點 **載入未封裝項目**，選擇此資料夾

## 使用方式

- 新分頁會自動重新定位 — 不需任何設定。
- 點工具列圖示即可開關「關閉後焦點往左」。

## 多語系

介面與商店文字提供以下語言：

- 英文（`en`，預設）
- 繁體中文（`zh_TW`）
- 簡體中文（`zh_CN`）
- 日文（`ja`）

## 權限

| 權限 | 用途 |
|-----------|-----|
| `tabs`    | 讀取分頁位置、移動／切換分頁。絕不讀取網頁內容。 |
| `storage` | 儲存「關閉後焦點往左」的單一開關設定。 |

完整隱私權政策請見 [PRIVACY.md](PRIVACY.md)。

## 專案結構

```
manifest.json          擴充功能 manifest（MV3）
background.js          Service worker：分頁定位 + 焦點邏輯
popup.html / popup.js  設定彈出視窗
icon-*.png / icon.svg  工具列／商店圖示
_locales/              翻譯（en, zh_TW, zh_CN, ja）
store-assets/          商店截圖與宣傳圖磚
STORE_LISTING.md       上架文案與權限說明
package.sh             打包成 dist/ 內的上架用 zip
```

## 打包上架 Chrome Web Store

```bash
./package.sh
```

會在 `dist/open-tab-to-the-right.zip` 產生只含必要檔案的封裝，上傳到
[Developer Dashboard](https://chrome.google.com/webstore/devconsole/) 即可。

## 授權

MIT
