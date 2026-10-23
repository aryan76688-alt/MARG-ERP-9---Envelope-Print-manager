package com.shreeji.envelope

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class ShreejiBackgroundService : Service(), LocationListener {

    companion object {
        const val CHANNEL_ID = "shreeji_background_channel"
        const val NOTIFICATION_ID = 1001
        const val WATCHDOG_INTERVAL_MS = 30 * 60 * 1000L // 30 minutes auto-restart watchdog
        const val LOCATION_MIN_TIME_MS = 15000L          // 15 seconds
        const val LOCATION_MIN_DISTANCE_M = 10.0f         // 10 meters
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var locationManager: LocationManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val watchdogRunnable = object : Runnable {
        override fun run() {
            performWatchdogRestart()
            mainHandler.postDelayed(this, WATCHDOG_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
        initLocationTracking()
        scheduleWatchdogAlarm()
        mainHandler.postDelayed(watchdogRunnable, WATCHDOG_INTERVAL_MS)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildForegroundNotification()
        startForeground(NOTIFICATION_ID, notification)
        initLocationTracking()
        scheduleWatchdogAlarm()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacks(watchdogRunnable)
        stopLocationTracking()
        releaseWakeLock()
        scheduleWatchdogAlarm() // Guarantee re-spawn if killed
    }

    private fun scheduleWatchdogAlarm() {
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager ?: return
            val restartIntent = Intent(this, BootCompletedReceiver::class.java).apply {
                action = "com.shreeji.envelope.ACTION_WATCHDOG_RESTART"
            }
            val pendingIntent = PendingIntent.getBroadcast(
                this,
                999,
                restartIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val triggerAt = System.currentTimeMillis() + WATCHDOG_INTERVAL_MS
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
            } else {
                alarmManager.setExact(android.app.AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun performWatchdogRestart() {
        try {
            // Re-acquire partial wakelock to prevent Android CPU sleep
            releaseWakeLock()
            acquireWakeLock()
            // Reset and restart location listeners
            stopLocationTracking()
            initLocationTracking()
            scheduleWatchdogAlarm()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun initLocationTracking() {
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) 
            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return
        }

        try {
            if (locationManager == null) {
                locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            }

            locationManager?.let { lm ->
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        LOCATION_MIN_TIME_MS,
                        LOCATION_MIN_DISTANCE_M,
                        this,
                        Looper.getMainLooper()
                    )
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        LOCATION_MIN_TIME_MS,
                        LOCATION_MIN_DISTANCE_M,
                        this,
                        Looper.getMainLooper()
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopLocationTracking() {
        try {
            locationManager?.removeUpdates(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onLocationChanged(loc: Location) {
        // Send live coordinates to local Termux/backend server in background thread
        thread {
            try {
                val json = JSONObject().apply {
                    put("latitude", loc.latitude)
                    put("longitude", loc.longitude)
                    put("accuracy", loc.accuracy.toDouble())
                    put("speed", loc.speed.toDouble())
                    put("heading", loc.bearing.toDouble())
                    put("source", "android_background_service")
                    put("timestamp", System.currentTimeMillis())
                }

                val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                val customServer = prefs.getString("backend_url", null)
                val endpoints = mutableListOf(
                    "http://127.0.0.1:8080/api/users/live-location",
                    "http://192.168.1.10:8080/api/users/live-location",
                    "https://shreeji-envelope.aryan76688.workers.dev/api/users/live-location"
                )
                if (!customServer.isNullOrBlank()) {
                    val formatted = customServer.trimEnd('/') + "/api/users/live-location"
                    endpoints.add(0, formatted)
                }

                for (endpoint in endpoints) {
                    try {
                        val url = URL(endpoint)
                        val conn = url.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.connectTimeout = 3000
                        conn.readTimeout = 3000
                        conn.doOutput = true

                        OutputStreamWriter(conn.outputStream).use { writer ->
                            writer.write(json.toString())
                            writer.flush()
                        }

                        val responseCode = conn.responseCode
                        conn.disconnect()
                        if (responseCode == 200 || responseCode == 201) {
                            break
                        }
                    } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Shreeji Emergency & Background Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous background location tracking, watchdog auto-restart, and live sync"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Shreeji Envelope Manager")
            .setContentText("Continuous background protection • Live tracking & 30-min watchdog active")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "ShreejiEnvelope::BackgroundServiceWakeLock"
            ).apply {
                acquire(24 * 60 * 60 * 1000L) // 24 hours max
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
