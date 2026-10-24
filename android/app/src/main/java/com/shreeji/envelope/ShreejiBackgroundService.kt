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
        const val LOCATION_MIN_TIME_MS = 5000L           // 5 seconds high-precision fleet tracking
        const val LOCATION_MIN_DISTANCE_M = 2.0f         // 2 meters sensitivity
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
                val prefs = getSharedPreferences("shreeji_prefs", Context.MODE_PRIVATE)
                val activeTripId = prefs.getInt("active_trip_id", 0)
                val activeVehicleId = prefs.getInt("active_vehicle_id", 0)
                val batteryManager = getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager
                val batteryPct = batteryManager?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 100

                val telemetryJson = JSONObject().apply {
                    put("latitude", loc.latitude)
                    put("longitude", loc.longitude)
                    put("accuracy", loc.accuracy.toDouble())
                    put("speed", loc.speed.toDouble())
                    put("speed_unit", "mps")
                    put("speed_type", "measured")
                    put("heading", loc.bearing.toDouble())
                    put("battery", batteryPct)
                    put("source", "android_background_service")
                    put("timestamp", System.currentTimeMillis())
                    if (activeTripId > 0) put("trip_id", activeTripId)
                    if (activeVehicleId > 0) put("vehicle_id", activeVehicleId)
                }

                val legacyUserJson = JSONObject().apply {
                    put("latitude", loc.latitude)
                    put("longitude", loc.longitude)
                    put("accuracy", loc.accuracy.toDouble())
                    put("speed", loc.speed.toDouble())
                    put("heading", loc.bearing.toDouble())
                    put("battery", batteryPct)
                    put("source", "android_background_service")
                    put("timestamp", System.currentTimeMillis())
                }

                val customServer = prefs.getString("backend_url", null)
                val baseEndpoints = mutableListOf(
                    "http://127.0.0.1:8080",
                    "http://192.168.1.10:8080",
                    "https://shreeji-envelope.aryan76688.workers.dev"
                )
                if (!customServer.isNullOrBlank()) {
                    baseEndpoints.add(0, customServer.trimEnd('/'))
                }

                for (base in baseEndpoints) {
                    try {
                        // 1. Post to Fleet Telemetry Ingest
                        val fleetUrl = URL("$base/api/fleet/telemetry/ingest")
                        val connFleet = fleetUrl.openConnection() as HttpURLConnection
                        connFleet.requestMethod = "POST"
                        connFleet.setRequestProperty("Content-Type", "application/json")
                        connFleet.connectTimeout = 3000
                        connFleet.readTimeout = 3000
                        connFleet.doOutput = true

                        OutputStreamWriter(connFleet.outputStream).use { writer ->
                            writer.write(telemetryJson.toString())
                            writer.flush()
                        }
                        val fleetCode = connFleet.responseCode
                        connFleet.disconnect()

                        // 2. Post to User Live Location
                        val userUrl = URL("$base/api/users/live-location")
                        val connUser = userUrl.openConnection() as HttpURLConnection
                        connUser.requestMethod = "POST"
                        connUser.setRequestProperty("Content-Type", "application/json")
                        connUser.connectTimeout = 3000
                        connUser.readTimeout = 3000
                        connUser.doOutput = true

                        OutputStreamWriter(connUser.outputStream).use { writer ->
                            writer.write(legacyUserJson.toString())
                            writer.flush()
                        }
                        val userCode = connUser.responseCode
                        connUser.disconnect()

                        if (fleetCode == 200 || userCode == 200) {
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
                "MARG Fleet Tracking & Protection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous 5s GPS fleet tracking, watchdog auto-restart, and live trip synchronization"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
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
            .setContentTitle("MARG Fleet & Driver Service")
            .setContentText("Trip Active • Live Fleet GPS (5s interval) • Safe & Synced")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
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
