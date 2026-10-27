package com.shreeji.envelope

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import java.io.File
import java.io.FileOutputStream
import android.view.View
import android.webkit.*
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    companion object {
        const val LOCAL_APP_URL = "https://appassets.androidplatform.net/assets/index.html?mode=apk"
        const val REMOTE_FALLBACK_URL = "https://shreeji-envelope.aryan76688.workers.dev/?mode=apk"
    }

    private lateinit var rootLayout: View
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorLayout: View
    private lateinit var retryButton: Button

    private lateinit var assetLoader: WebViewAssetLoader
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraCapturedUri: Uri? = null
    private lateinit var fileChooserLauncher: ActivityResultLauncher<Intent>
    private lateinit var appPermissionLauncher: ActivityResultLauncher<Array<String>>
    private var downloadCompleteReceiver: android.content.BroadcastReceiver? = null

    inner class WebAppInterface(private val mContext: Context) {
        @JavascriptInterface
        fun isAndroidApp(): Boolean = true

        @JavascriptInterface
        fun showToast(message: String) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show()
        }

        @JavascriptInterface
        fun triggerEmergencyCall(phoneNumber: String) {
            runOnUiThread {
                try {
                    val cleanNumber = phoneNumber.replace(Regex("[^0-9+]"), "")
                    if (androidx.core.content.ContextCompat.checkSelfPermission(
                            mContext,
                            android.Manifest.permission.CALL_PHONE
                        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                    ) {
                        val callIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$cleanNumber")).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        mContext.startActivity(callIntent)
                    } else {
                        val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanNumber")).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        mContext.startActivity(dialIntent)
                    }
                } catch (e: Exception) {
                    Toast.makeText(mContext, "Emergency call error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun triggerEmergencySOS() {
            triggerEmergencyCall("9924544283")
        }

        @JavascriptInterface
        fun getStorageStatus(): String {
            return try {
                val stat = android.os.StatFs(Environment.getExternalStorageDirectory().path)
                val bytesAvailable = stat.availableBlocksLong * stat.blockSizeLong
                val bytesTotal = stat.blockCountLong * stat.blockSizeLong
                org.json.JSONObject().apply {
                    put("available_mb", bytesAvailable / (1024 * 1024))
                    put("total_mb", bytesTotal / (1024 * 1024))
                    put("has_all_files_access", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager() else true)
                    put("root_path", Environment.getExternalStorageDirectory().path)
                }.toString()
            } catch (e: Exception) {
                "{}"
            }
        }

        @JavascriptInterface
        fun requestStorageAccess() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    if (!Environment.isExternalStorageManager()) {
                        try {
                            val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                                data = Uri.parse("package:$packageName")
                            }
                            startActivity(intent)
                        } catch (_: Exception) {
                            try {
                                val intent = Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                                startActivity(intent)
                            } catch (_: Exception) {}
                        }
                    } else {
                        Toast.makeText(mContext, "All files access already granted.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }

        @JavascriptInterface
        fun setBackendServerUrl(url: String) {
            try {
                val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("backend_url", url.trim()).apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun setActiveTrip(tripId: Int, vehicleId: Int) {
            try {
                val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                prefs.edit()
                    .putInt("active_trip_id", tripId)
                    .putInt("active_vehicle_id", vehicleId)
                    .apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun clearActiveTrip() {
            try {
                val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                prefs.edit()
                    .remove("active_trip_id")
                    .remove("active_vehicle_id")
                    .apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun startBackgroundTracking() {
            runOnUiThread {
                startBackgroundService()
            }
        }

        @JavascriptInterface
        fun getBatteryLevel(): Int {
            return try {
                val bm = getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager
                bm?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 100
            } catch (e: Exception) {
                100
            }
        }

        @JavascriptInterface
        fun saveDatabaseToStorage(dbBase64: String, fileName: String): Boolean {
            return try {
                val decoded = android.util.Base64.decode(dbBase64, android.util.Base64.DEFAULT)
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ShreejiBackups")
                if (!dir.exists()) dir.mkdirs()
                val targetFile = File(dir, fileName.ifBlank { "envelope_manager_backup.db" })
                java.io.FileOutputStream(targetFile).use { it.write(decoded) }
                runOnUiThread {
                    Toast.makeText(mContext, "Database backed up to ${targetFile.name}", Toast.LENGTH_LONG).show()
                }
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }

        @JavascriptInterface
        fun getAppVersion(): String = "2.4.0"

        @JavascriptInterface
        fun getAppVersionCode(): Int = 240

        @JavascriptInterface
        fun checkForUpdate() {
            runOnUiThread {
                Toast.makeText(mContext, "Checking for latest APK update...", Toast.LENGTH_SHORT).show()
                checkAppUpdateOnBackground(manual = true)
            }
        }

        @JavascriptInterface
        fun triggerUpdate(apkUrl: String) {
            runOnUiThread {
                try {
                    val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                    val baseServer = prefs.getString("backend_url", "https://shreeji-envelope.aryan76688.workers.dev") ?: "https://shreeji-envelope.aryan76688.workers.dev"
                    val resolvedUrl = if (apkUrl.startsWith("http://") || apkUrl.startsWith("https://")) {
                        apkUrl
                    } else {
                        val trimmedBase = baseServer.trimEnd('/')
                        val trimmedPath = if (apkUrl.startsWith("/")) apkUrl else "/$apkUrl"
                        "$trimmedBase$trimmedPath"
                    }

                    triggerDownloadViaManager(resolvedUrl)
                } catch (e: Exception) {
                    e.printStackTrace()
                    Toast.makeText(mContext, "Could not start download: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun triggerDownloadViaManager(fullUrl: String) {
        try {
            val oldFile = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "EnvelopeManager.apk")
            if (oldFile.exists()) oldFile.delete()
        } catch (_: Exception) {}

        try {
            val request = DownloadManager.Request(Uri.parse(fullUrl)).apply {
                setMimeType("application/vnd.android.package-archive")
                setTitle("EnvelopeManager.apk")
                setDescription("Downloading Shreeji Envelope Manager update...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "EnvelopeManager.apk")
            }
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
            dm?.enqueue(request)
            Toast.makeText(this, "Downloading update APK...", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            e.printStackTrace()
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl)))
            } catch (_: Exception) {}
        }
    }

    private fun checkAppUpdateOnBackground(manual: Boolean = false) {
        Thread {
            try {
                val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                val baseServer = prefs.getString("backend_url", "https://shreeji-envelope.aryan76688.workers.dev") ?: "https://shreeji-envelope.aryan76688.workers.dev"
                val checkUrl = baseServer.trimEnd('/') + "/api/app/version"
                val conn = java.net.URL(checkUrl).openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 4000
                conn.requestMethod = "GET"
                if (conn.responseCode == 200) {
                    val resp = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = org.json.JSONObject(resp)
                    val remoteVersionCode = json.optInt("version_code", 0)
                    val remoteVersion = json.optString("version", "2.4.0")
                    val apkPath = json.optString("apk_url", "/downloads/EnvelopeManager.apk")
                    val currentVersionCode = 240

                    if (remoteVersionCode > currentVersionCode) {
                        runOnUiThread {
                            androidx.appcompat.app.AlertDialog.Builder(this)
                                .setTitle("Update Available • નવી આવૃત્તિ")
                                .setMessage("A new version of Shreeji Envelope Manager (v$remoteVersion) is available.\n\nDo you want to update now?")
                                .setPositiveButton("Update Now (અપડેટ કરો)") { _, _ ->
                                    val fullUrl = if (apkPath.startsWith("http")) apkPath else baseServer.trimEnd('/') + (if (apkPath.startsWith("/")) apkPath else "/$apkPath")
                                    triggerDownloadViaManager(fullUrl)
                                }
                                .setNegativeButton("Later", null)
                                .show()
                        }
                    } else if (manual) {
                        runOnUiThread {
                            Toast.makeText(this, "You are using the latest version (v2.4.0)", Toast.LENGTH_SHORT).show()
                        }
                    }
                } else if (manual) {
                    runOnUiThread {
                        Toast.makeText(this, "Could not check update (Server HTTP ${conn.responseCode})", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                if (manual) {
                    runOnUiThread {
                        Toast.makeText(this, "Could not connect to update server: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }.start()
    }

    private fun startBackgroundService() {
        try {
            val serviceIntent = Intent(this, ShreejiBackgroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startBackgroundService()

        // Light Theme Status Bar & Navigation Bar configuration
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            window.statusBarColor = 0xFFF8FAFC.toInt()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.navigationBarColor = 0xFFFFFFFF.toInt()
            window.decorView.systemUiVisibility = window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }

        setContentView(R.layout.activity_main)

        rootLayout = findViewById(R.id.rootLayout)
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        errorLayout = findViewById(R.id.errorLayout)
        retryButton = findViewById(R.id.retryButton)

        // Fix Upper UI: Ensure camera notch/punch-hole cutout & status bar panel never clip web content
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.updatePadding(
                left = insets.left,
                top = insets.top,
                right = insets.right,
                bottom = insets.bottom
            )
            windowInsets
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        initFileChooserLauncher()
        initAllPermissionsLauncher()
        initWebView()
        registerDownloadReceiver()
        requestAllPermissions()
        checkAppUpdateOnBackground(manual = false)

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

    private fun initAllPermissionsLauncher() {
        appPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->
            val fineGranted = permissions[android.Manifest.permission.ACCESS_FINE_LOCATION] == true
            // If fine location granted and Android 10+, request background location
            if (fineGranted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                if (androidx.core.content.ContextCompat.checkSelfPermission(
                        this,
                        android.Manifest.permission.ACCESS_BACKGROUND_LOCATION
                    ) != android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    appPermissionLauncher.launch(arrayOf(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION))
                }
            }
        }
    }

    private fun requestAllPermissions() {
        val perms = mutableListOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.CAMERA,
            android.Manifest.permission.RECORD_AUDIO,
            android.Manifest.permission.MODIFY_AUDIO_SETTINGS,
            android.Manifest.permission.CALL_PHONE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            perms.add(android.Manifest.permission.READ_EXTERNAL_STORAGE)
            perms.add(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
        appPermissionLauncher.launch(perms.toTypedArray())

        // Android 11+ (API 30+) Scoped Storage / All Files Access
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } catch (_: Exception) {
                    try {
                        val intent = Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                        startActivity(intent)
                    } catch (_: Exception) {}
                }
            }
        }
    }

    private fun registerDownloadReceiver() {
        downloadCompleteReceiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == DownloadManager.ACTION_DOWNLOAD_COMPLETE) {
                    val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                    if (downloadId != -1L) {
                        handleDownloadCompleted(downloadId)
                    }
                }
            }
        }
        val filter = android.content.IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadCompleteReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(downloadCompleteReceiver, filter)
        }
    }

    private fun handleDownloadCompleted(downloadId: Long) {
        try {
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager ?: return
            val query = DownloadManager.Query().setFilterById(downloadId)
            val cursor = dm.query(query)
            if (cursor != null && cursor.moveToFirst()) {
                val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                if (statusIdx != -1 && cursor.getInt(statusIdx) == DownloadManager.STATUS_SUCCESSFUL) {
                    val downloadedContentUri = dm.getUriForDownloadedFile(downloadId)
                    if (downloadedContentUri != null) {
                        promptApkInstall(downloadedContentUri)
                    } else {
                        val file = java.io.File(
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                            "EnvelopeManager.apk"
                        )
                        if (file.exists()) {
                            val apkUri = androidx.core.content.FileProvider.getUriForFile(
                                this,
                                "${applicationContext.packageName}.fileprovider",
                                file
                            )
                            promptApkInstall(apkUri)
                        }
                    }
                }
                cursor.close()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun promptApkInstall(apkUri: Uri) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!packageManager.canRequestPackageInstalls()) {
                    val manageIntent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(manageIntent)
                    Toast.makeText(this, "Please allow 'Install unknown apps' to complete update", Toast.LENGTH_LONG).show()
                    return
                }
            }

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(installIntent)
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Could not open installer: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun initFileChooserLauncher() {
        fileChooserLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val callback = filePathCallback ?: return@registerForActivityResult
            var results: Array<Uri>? = null
            if (result.resultCode == RESULT_OK) {
                val data = result.data
                val clipData = data?.clipData
                if (clipData != null) {
                    val count = clipData.itemCount
                    results = Array(count) { i -> clipData.getItemAt(i).uri }
                } else if (data?.data != null) {
                    results = arrayOf(data.data!!)
                } else if (cameraCapturedUri != null) {
                    results = arrayOf(cameraCapturedUri!!)
                }
            }
            callback.onReceiveValue(results)
            filePathCallback = null
            cameraCapturedUri = null
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
        settings.setGeolocationEnabled(true)
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.setSupportMultipleWindows(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }
        CookieManager.getInstance().setAcceptCookie(true)

        val originalUA = settings.userAgentString
        settings.userAgentString = "$originalUA ShreejiEnvelopeApp/1.0.0 (Android FullStack APK)"

        // Native Bi-Directional Smooth Scrolling Configuration
        webView.isVerticalScrollBarEnabled = true
        webView.isScrollbarFadingEnabled = true
        webView.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
        webView.overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
        webView.isNestedScrollingEnabled = true
        webView.setBackgroundColor(0xFFF8FAFC.toInt())

        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

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
                this@MainActivity.cameraCapturedUri = null

                val isCapture = fileChooserParams?.isCaptureEnabled == true
                val acceptTypes = fileChooserParams?.acceptTypes ?: emptyArray()
                val isImage = acceptTypes.any { it.contains("image", ignoreCase = true) }

                if (isCapture || isImage) {
                    try {
                        val photoFile = java.io.File.createTempFile(
                            "POD_PHOTO_${System.currentTimeMillis()}",
                            ".jpg",
                            cacheDir
                        )
                        val photoUri = androidx.core.content.FileProvider.getUriForFile(
                            this@MainActivity,
                            "${applicationContext.packageName}.fileprovider",
                            photoFile
                        )
                        cameraCapturedUri = photoUri

                        val takePictureIntent = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
                            putExtra(android.provider.MediaStore.EXTRA_OUTPUT, photoUri)
                            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }

                        if (isCapture) {
                            fileChooserLauncher.launch(takePictureIntent)
                            return true
                        } else {
                            val pickIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                                type = "image/*"
                            }
                            val chooserIntent = Intent.createChooser(pickIntent, "Take Photo or Select Image").apply {
                                putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(takePictureIntent))
                            }
                            fileChooserLauncher.launch(chooserIntent)
                            return true
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

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
                    fileChooserLauncher.launch(Intent.createChooser(intent, "Select File"))
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
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("whatsapp:") || url.startsWith("https://wa.me/") || url.contains("api.whatsapp.com")) {
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
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                errorLayout.visibility = View.GONE
                webView.visibility = View.VISIBLE
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
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
        downloadCompleteReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
