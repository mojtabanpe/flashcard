# Recall for Android

The WebView loads https://poshtetgarm.ir directly. Web deployments update the UI;
no Angular assets are bundled. Internet is required. Microphone access is requested
only when recording an answer, and only the site's HTTPS origin is allowed.
Install version 1.1.0 once to replace the old bundled-UI APK. Future web changes
follow the site's usual update flow; native changes still require a new APK.

## Build

Requires Node.js, installed frontend dependencies, JDK 17+ and Android SDK 36.
Set `ANDROID_HOME` if the SDK is not at `~/Library/Android/sdk`.

```sh
bash scripts/build-android.sh
```

Output: `dist/apk/recall-android.apk`. This is an installable APK signed with the
local Android debug key, for direct testing. It is not a Play Store release.
Requires Android 8.0 or newer and an up-to-date Android System WebView.

For distribution, configure a private release keystore outside the repository,
increment `versionCode`, and build a signed release. Never commit signing keys.

Implementation follows Android's local content guidance:
https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
