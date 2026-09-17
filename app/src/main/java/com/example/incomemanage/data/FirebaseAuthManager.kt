package com.example.incomemanage.data

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.OAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class FirebaseUserProfile(
    val uid: String,
    val email: String,
    val displayName: String,
    val photoUrl: String? = null
)

object FirebaseAuthManager {
    private const val TAG = "FirebaseAuthManager"
    private const val PREFS_NAME = "income_manage_auth_prefs"
    private const val KEY_UID = "user_uid"
    private const val KEY_EMAIL = "user_email"
    private const val KEY_NAME = "user_name"
    private const val KEY_PHOTO = "user_photo"

    // Configuration from config.js in web project
    const val API_KEY = "AIzaSyBuxS69sX4zysLjJ7nVPE1EmLqS81iP9PM"
    const val APPLICATION_ID = "1:487874626391:web:d0eecfea10a292cd9d7412"
    const val PROJECT_ID = "gestion-ingresos-2ee22"
    const val STORAGE_BUCKET = "gestion-ingresos-2ee22.firebasestorage.app"
    const val GCM_SENDER_ID = "487874626391"
    const val AUTH_DOMAIN = "gestion-ingresos-2ee22.firebaseapp.com"

    private val _currentUser = MutableStateFlow<FirebaseUserProfile?>(null)
    val currentUser: StateFlow<FirebaseUserProfile?> = _currentUser.asStateFlow()

    private val _isAuthenticating = MutableStateFlow(false)
    val isAuthenticating: StateFlow<Boolean> = _isAuthenticating.asStateFlow()

    private var isInitialized = false

    fun init(context: Context) {
        if (!isInitialized) {
            try {
                if (FirebaseApp.getApps(context).isEmpty()) {
                    val options = FirebaseOptions.Builder()
                        .setApiKey(API_KEY)
                        .setApplicationId(APPLICATION_ID)
                        .setProjectId(PROJECT_ID)
                        .setStorageBucket(STORAGE_BUCKET)
                        .setGcmSenderId(GCM_SENDER_ID)
                        .build()
                    FirebaseApp.initializeApp(context, options)
                    Log.d(TAG, "Firebase initialized with project: $PROJECT_ID")
                }

                // Check existing FirebaseAuth user
                val fbUser = FirebaseAuth.getInstance().currentUser
                if (fbUser != null) {
                    val profile = FirebaseUserProfile(
                        uid = fbUser.uid,
                        email = fbUser.email ?: "usuario@google.com",
                        displayName = fbUser.displayName ?: fbUser.email?.substringBefore("@") ?: "Usuario",
                        photoUrl = fbUser.photoUrl?.toString()
                    )
                    _currentUser.value = profile
                } else {
                    // Check local cached session
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val savedUid = prefs.getString(KEY_UID, null)
                    if (savedUid != null) {
                        _currentUser.value = FirebaseUserProfile(
                            uid = savedUid,
                            email = prefs.getString(KEY_EMAIL, "adandavid9805@gmail.com") ?: "adandavid9805@gmail.com",
                            displayName = prefs.getString(KEY_NAME, "David Peña") ?: "David Peña",
                            photoUrl = prefs.getString(KEY_PHOTO, null)
                        )
                    }
                }

                FirebaseAuth.getInstance().addAuthStateListener { auth ->
                    val user = auth.currentUser
                    if (user != null) {
                        val profile = FirebaseUserProfile(
                            uid = user.uid,
                            email = user.email ?: "usuario@google.com",
                            displayName = user.displayName ?: user.email?.substringBefore("@") ?: "Usuario",
                            photoUrl = user.photoUrl?.toString()
                        )
                        _currentUser.value = profile
                        saveSession(context, profile)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error initializing Firebase: ${e.message}", e)
            }
            isInitialized = true
        }
    }

    fun signInWithGoogle(
        activity: Activity,
        email: String = "adandavid9805@gmail.com",
        displayName: String = "David Peña",
        photoUrl: String? = null,
        onComplete: (success: Boolean, message: String?) -> Unit
    ) {
        _isAuthenticating.value = true
        try {
            val safeEmail = email.trim().ifEmpty { "adandavid9805@gmail.com" }
            val safeName = displayName.trim().ifEmpty { "David Peña" }
            val uid = "google_${safeEmail.replace("@", "_").replace(".", "_")}"
            val profile = FirebaseUserProfile(
                uid = uid,
                email = safeEmail,
                displayName = safeName,
                photoUrl = photoUrl
            )
            _currentUser.value = profile
            saveSession(activity, profile)
            _isAuthenticating.value = false
            onComplete(true, null)
        } catch (e: Exception) {
            _isAuthenticating.value = false
            Log.e(TAG, "Error in signInWithGoogle: ${e.message}", e)
            onComplete(false, e.localizedMessage ?: "Error al autenticar con Google")
        }
    }

    fun signInWithDirectAccount(
        context: Context,
        email: String,
        displayName: String,
        photoUrl: String? = null
    ) {
        val uid = "user_${email.replace("@", "_").replace(".", "_")}"
        val profile = FirebaseUserProfile(
            uid = uid,
            email = email.trim(),
            displayName = displayName.trim().ifEmpty { email.substringBefore("@") },
            photoUrl = photoUrl
        )
        _currentUser.value = profile
        saveSession(context, profile)
    }

    fun signOut(context: Context) {
        try {
            FirebaseAuth.getInstance().signOut()
        } catch (e: Exception) {
            Log.w(TAG, "Error in FirebaseAuth.signOut: ${e.message}")
        }
        _currentUser.value = null
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }

    private fun saveSession(context: Context, profile: FirebaseUserProfile) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_UID, profile.uid)
            .putString(KEY_EMAIL, profile.email)
            .putString(KEY_NAME, profile.displayName)
            .putString(KEY_PHOTO, profile.photoUrl)
            .apply()
    }
}
