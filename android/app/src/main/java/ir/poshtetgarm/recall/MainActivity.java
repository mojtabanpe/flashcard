package ir.poshtetgarm.recall;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/** Live HTTPS application with persistent session cookies. */
public final class MainActivity extends Activity {
    private static final String HOST = "poshtetgarm.ir";
    private WebView webView;
    private android.webkit.PermissionRequest pendingPermission;

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 10 && pendingPermission != null) {
            if (results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED)
                pendingPermission.grant(new String[] { android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE });
            else pendingPermission.deny();
            pendingPermission = null;
        }
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(
            android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(android.graphics.Color.WHITE);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                    android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> {
                    if (webView.canGoBack()) webView.goBack();
                    else finish();
                });
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!"https".equals(request.getOrigin().getScheme()) || !HOST.equals(request.getOrigin().getHost()) || (request.getOrigin().getPort() != -1 && request.getOrigin().getPort() != 443)) { request.deny(); return; }
                    if (!java.util.Arrays.asList(request.getResources()).contains(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { request.deny(); return; }
                    if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[] { android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                    } else {
                        if (pendingPermission != null) pendingPermission.deny();
                        pendingPermission = request;
                        requestPermissions(new String[] { android.Manifest.permission.RECORD_AUDIO }, 10);
                    }
                });
            }
            @Override
            public void onPermissionRequestCanceled(android.webkit.PermissionRequest request) {
                if (pendingPermission == request) pendingPermission = null;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
                    && uri.getPath() != null && !uri.getPath().startsWith("/api/")) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())
                    || "mailto".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl("https://" + HOST + "/");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        webView.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (pendingPermission != null) { pendingPermission.deny(); pendingPermission = null; }
        webView.destroy();
        super.onDestroy();
    }
}
