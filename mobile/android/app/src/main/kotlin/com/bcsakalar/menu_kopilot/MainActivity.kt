package com.bcsakalar.menu_kopilot

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import io.flutter.embedding.android.FlutterActivity
import java.io.IOException

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The share plugin reads the launch intent while the engine attaches, i.e. inside super.onCreate.
        intent = readableShare(intent)
        super.onCreate(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        val safe = readableShare(intent) ?: intent
        setIntent(safe)
        super.onNewIntent(safe)
    }

    /**
     * A share whose sender did not grant read access to its files makes the share plugin throw a SecurityException on
     * the main thread, which kills the app. Unreadable files are dropped before the plugin sees the intent; a share
     * left with nothing to add becomes a plain launch with a short notice.
     */
    private fun readableShare(intent: Intent?): Intent? {
        if (intent == null) return null
        val multiple = intent.action == Intent.ACTION_SEND_MULTIPLE
        if (intent.action != Intent.ACTION_SEND && !multiple) return intent
        return try {
            val streams = streamsOf(intent, multiple)
            val readable = streams.indices.filter { canRead(streams[it]) }
            if (readable.size == streams.size) return intent

            Log.w(TAG, "Dropped ${streams.size - readable.size} unreadable shared file(s)")
            Toast.makeText(this, R.string.share_unreadable, Toast.LENGTH_LONG).show()
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            val safe = Intent(intent).apply {
                removeExtra(Intent.EXTRA_STREAM)
                removeExtra(Intent.EXTRA_MIME_TYPES)
            }
            when {
                readable.isEmpty() && text.isNullOrBlank() -> plainLaunch()
                readable.isEmpty() -> safe.setAction(Intent.ACTION_SEND).setType("text/plain")
                multiple -> {
                    safe.putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(readable.map { streams[it] }))
                    intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES)?.takeIf { it.size == streams.size }?.let { types ->
                        safe.putExtra(Intent.EXTRA_MIME_TYPES, readable.map { types[it] }.toTypedArray())
                    }
                    safe
                }
                else -> safe.putExtra(Intent.EXTRA_STREAM, streams[readable.first()])
            }
        } catch (e: RuntimeException) {
            // Malformed extras from another app: open the app without the share.
            Log.w(TAG, "Ignored a malformed share", e)
            plainLaunch()
        }
    }

    private fun plainLaunch(): Intent = Intent(this, MainActivity::class.java).setAction(Intent.ACTION_MAIN)

    @Suppress("DEPRECATION")
    private fun streamsOf(intent: Intent, multiple: Boolean): List<Uri> =
        if (multiple) {
            val list = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            }
            list.orEmpty().filterNotNull()
        } else {
            val single = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            }
            listOfNotNull(single)
        }

    private fun canRead(uri: Uri): Boolean =
        try {
            contentResolver.openAssetFileDescriptor(uri, "r")?.use { true } ?: false
        } catch (e: SecurityException) {
            false
        } catch (e: IOException) {
            false
        } catch (e: IllegalArgumentException) {
            false
        } catch (e: UnsupportedOperationException) {
            false
        }

    private companion object {
        const val TAG = "MenuKopilot"
    }
}
