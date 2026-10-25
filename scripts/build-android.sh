#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
(cd android && ./gradlew --no-daemon assembleDebug "$@")
mkdir -p dist/apk
cp android/app/build/outputs/apk/debug/app-debug.apk dist/apk/recall-android.apk
printf 'APK: %s/dist/apk/recall-android.apk\n' "$PWD"
