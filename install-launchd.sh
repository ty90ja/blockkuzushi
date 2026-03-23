#!/bin/bash
# voicevox-proxy を macOS launchd に登録するスクリプト

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/voicevox-proxy.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.blockkuzushi.voicevox-proxy.plist"
PYTHON_PATH="$(which python3)"

# plist をコピーしてパスを書き換え
cp "$PLIST_SRC" "$PLIST_DEST"
sed -i '' "s|REPLACE_WITH_YOUR_PATH|$SCRIPT_DIR|g" "$PLIST_DEST"
sed -i '' "s|/usr/bin/python3|$PYTHON_PATH|g" "$PLIST_DEST"

echo "plist installed to: $PLIST_DEST"
echo "python3: $PYTHON_PATH"
echo "proxy script: $SCRIPT_DIR/voicevox-proxy.py"

# 既存のサービスを停止してから再読み込み
if launchctl list com.blockkuzushi.voicevox-proxy &>/dev/null; then
    launchctl unload "$PLIST_DEST"
fi

launchctl load "$PLIST_DEST"
echo ""
echo "launchd に登録しました。Macログイン時に自動起動します。"
echo "ログ: /tmp/voicevox-proxy.log"
echo "エラーログ: /tmp/voicevox-proxy.error.log"
echo ""
echo "確認: curl http://localhost:50022/version"
