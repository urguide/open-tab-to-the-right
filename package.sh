#!/usr/bin/env bash
# Build a Chrome Web Store-ready zip containing only the files Chrome needs.
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="dist"
ZIP_NAME="open-tab-to-the-right.zip"

# Files/dirs that ship inside the extension package.
INCLUDE=(
  manifest.json
  background.js
  popup.html
  popup.js
  icon-16.png
  icon-32.png
  icon-48.png
  icon-128.png
  _locales
)

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ZIP_NAME"

zip -r "$OUT_DIR/$ZIP_NAME" "${INCLUDE[@]}" -x "*.DS_Store"

echo "Created $OUT_DIR/$ZIP_NAME"
