package com.shreeji.envelope

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.*
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    companion object {
        const val LOCAL_APP_URL = "https://appassets.androidplatform.net/assets/index.html?mode=apk"
        const val REMOTE_FALLBACK_URL = "https://marg-envelope-manager-production.up.railway.app/?mode=apk"
    }

    private lateinit var webView: WebView
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var errorLayout: View
    private lateinit var retryButton: Button

    private lateinit var assetLoader: WebViewAssetLoader
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooserLauncher: ActivityResultLauncher<Intent>

    class WebAppInterface(private val mContext: Context) {
        @JavascriptInterface
        fun isAndroidApp(): Boolean = true

        @JavascriptInterface
        fun showToast(message: String) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        progressBar = findViewById(R.id.progressBar)
        errorLayout = findViewById(R.id.errorLayout)
        retryButton = findViewById(R.id.retryButton)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        initFileChooserLauncher()
        initWebView()

        swipeRefreshLayout.setColorSchemeColors(0xFF2563EB.toInt(), 0xFF4F46E5.toInt())
        swipeRefreshLayout.setOnRefreshListener { webView.reload() }

        retryButton.setOnClickListener {
            errorLayout.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.reload()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        webView.loadUrl(LOCAL_APP_URL)
    }

    private fun initFileChooserLauncher() {
        fileChooserLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            var results: Array<Uri>? = null
            if (result.resultCode == RESULT_OK && result.data != null) {
                val data = result.data
                val clipData = data?.clipData
                if (clipData != null) {
                    val count = clipData.itemCount
                    results = Array(count) { i -> clipData.getItemAt(i).uri }
                } else if (data?.data != null) {
                    results = arrayOf(data.data!!)
                }
            }
            callback.onReceiveValue(results)
            filePathCallback = null
        }
    }

    private fun initWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }
        CookieManager.getInstance().setAcceptCookie(true)

        val originalUA = settings.userAgentString
        settings.userAgentString = "$originalUA ShreejiEnvelopeApp/1.0.0 (Android FullStack APK)"

        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        putExtra(
                            Intent.EXTRA_MIME_TYPES,
                            arrayOf(
                                "application/vnd.ms-excel",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                "application/pdf",
                                "text/csv",
                                "*/*"
                            )
                        )
                    }
                }

                try {
                    fileChooserLauncher.launch(Intent.createChooser(intent, "Select Excel / PDF File"))
                } catch (e: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    Toast.makeText(this@MainActivity, "Cannot open file picker", Toast.LENGTH_SHORT).show()
                    return false
                }
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.host == "appassets.androidplatform.net") {
                    val rawPath = url.path.orEmpty().trimStart('/')
                    val cleanPath = rawPath.removePrefix("assets/").removePrefix("web/")
                    val candidates = listOf(
                        rawPath,
                        rawPath.removePrefix("assets/"),
                        "assets/$rawPath",
                        cleanPath,
                        "assets/$cleanPath",
                        "web/$cleanPath",
                        "web/assets/$cleanPath"
                    )
                    for (candidate in candidates) {
                        try {
                            val inputStream = this@MainActivity.assets.open(candidate)
                            val mimeType = when {
                                candidate.endsWith(".html") -> "text/html"
                                candidate.endsWith(".js") -> "application/javascript"
                                candidate.endsWith(".css") -> "text/css"
                                candidate.endsWith(".png") -> "image/png"
                                candidate.endsWith(".jpg") || candidate.endsWith(".jpeg") -> "image/jpeg"
                                candidate.endsWith(".svg") -> "image/svg+xml"
                                candidate.endsWith(".json") -> "application/json"
                                candidate.endsWith(".woff2") -> "font/woff2"
                                candidate.endsWith(".woff") -> "font/woff"
                                candidate.endsWith(".ttf") -> "font/ttf"
                                else -> "application/octet-stream"
                            }
                            val headers = mapOf(
                                "Access-Control-Allow-Origin" to "*",
                                "Access-Control-Allow-Methods" to "GET, OPTIONS",
                                "Access-Control-Allow-Headers" to "*"
                            )
                            return WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, inputStream)
                        } catch (_: Exception) {}
                    }
                }
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("whatsapp:")) {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    } catch (ignored: Exception) {
                        false
                    }
                }
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                progressBar.visibility = View.VISIBLE
                swipeRefreshLayout.isRefreshing = false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                swipeRefreshLayout.isRefreshing = false
                errorLayout.visibility = View.GONE
                webView.visibility = View.VISIBLE
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                    swipeRefreshLayout.isRefreshing = false
                    val currentUrl = view?.url
                    if (currentUrl != null && currentUrl.contains("appassets.androidplatform.net")) {
                        webView.loadUrl(REMOTE_FALLBACK_URL)
                    } else {
                        webView.visibility = View.GONE
                        errorLayout.visibility = View.VISIBLE
                    }
                }
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            try {
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimetype)
                    CookieManager.getInstance().getCookie(url)?.let {
                        addRequestHeader("cookie", it)
                    }
                    addRequestHeader("User-Agent", userAgent)
                    var filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
                    if (url.contains("/api/print/") && !filename.endsWith(".pdf")) {
                        filename = "Envelope_Print_${System.currentTimeMillis()}.pdf"
                    }
                    setDescription("Downloading $filename")
                    setTitle(filename)
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                }

                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
                if (dm != null) {
                    dm.enqueue(request)
                    Toast.makeText(this, "Downloading: Envelope PDF", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        if (::webView.isInitialized) webView.onPause()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
