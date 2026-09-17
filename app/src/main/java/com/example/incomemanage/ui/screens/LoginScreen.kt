package com.example.incomemanage.ui.screens

import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.R
import com.example.incomemanage.ui.theme.BrandIndigo
import com.example.incomemanage.ui.theme.BrandIndigoBright
import com.example.incomemanage.ui.theme.IncomeEmerald
import com.example.incomemanage.ui.viewmodel.FinanceViewModel

@Composable
fun LoginScreen(
    viewModel: FinanceViewModel,
    onLoginSuccess: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val isAuthenticating by viewModel.isAuthenticating.collectAsState()
    val authError by viewModel.authErrorMessage.collectAsState()
    var showGoogleAccountChooser by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("login_screen"),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 480.dp)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Main Login Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_card"),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Logo and Brand Header
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(BrandIndigo),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.AccountBalanceWallet,
                                contentDescription = "Income Manage Logo",
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }

                        Text(
                            text = "Income Manage",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Title
                    Text(
                        text = "Gestione sus ingresos y gastos",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = TextAlign.Center,
                        lineHeight = 28.sp
                    )

                    // Subtitle
                    Text(
                        text = "Accede de forma segura y sincroniza tus transacciones en la nube desde cualquier dispositivo.",
                        fontSize = 13.5.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        textAlign = TextAlign.Center,
                        lineHeight = 20.sp
                    )

                    // Value points
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                                RoundedCornerShape(12.dp)
                            )
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = null,
                                tint = IncomeEmerald,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "Sincronización segura con Firebase Cloud",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Lock,
                                contentDescription = null,
                                tint = BrandIndigoBright,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "Espacios privados protegidos por Passphrase",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // Error Box if any
                    if (authError != null) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.errorContainer,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = authError ?: "",
                                    color = MaterialTheme.colorScheme.onErrorContainer,
                                    fontSize = 12.sp,
                                    modifier = Modifier.weight(1f)
                                )
                                TextButton(
                                    onClick = { viewModel.clearAuthError() },
                                    contentPadding = PaddingValues(horizontal = 4.dp)
                                ) {
                                    Text("Cerrar", fontSize = 11.sp)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Google Sign-In Button (Official Look and Styling)
                    Surface(
                        onClick = {
                            viewModel.clearAuthError()
                            showGoogleAccountChooser = true
                        },
                        enabled = !isAuthenticating,
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant
                        ),
                        shadowElevation = 2.dp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                            .testTag("btn_login_google")
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            if (isAuthenticating) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                    color = BrandIndigo
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = "Conectando con Google...",
                                    fontSize = 14.5.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            } else {
                                Image(
                                    painter = painterResource(id = R.drawable.ic_google_logo),
                                    contentDescription = "Google Logo",
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = "Iniciar sesión con Google",
                                    fontSize = 14.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }

                    // Direct One-Tap Quick Button
                    OutlinedButton(
                        onClick = {
                            viewModel.clearAuthError()
                            if (activity != null) {
                                viewModel.signInWithGoogle(activity, "adandavid9805@gmail.com", "David Peña") { success ->
                                    if (success) onLoginSuccess()
                                }
                            } else {
                                viewModel.signInDirectAccount("adandavid9805@gmail.com", "David Peña")
                                onLoginSuccess()
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                            .testTag("btn_quick_login"),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = IncomeEmerald,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Acceso Rápido como David Peña",
                            fontSize = 13.sp
                        )
                    }

                    // Footer
                    Text(
                        text = "Herramienta de gestionamiento de ingresos",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }

    // Google Account Chooser Dialog (Google One Tap experience)
    if (showGoogleAccountChooser) {
        var isCustomAccountMode by remember { mutableStateOf(false) }
        var customEmail by remember { mutableStateOf("adandavid9805@gmail.com") }
        var customName by remember { mutableStateOf("David Peña") }

        AlertDialog(
            onDismissRequest = { showGoogleAccountChooser = false },
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_google_logo),
                        contentDescription = "Google Logo",
                        modifier = Modifier.size(24.dp)
                    )
                    Column {
                        Text(
                            text = "Acceder con Google",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "para continuar en Income Manage",
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (!isCustomAccountMode) {
                        Text(
                            text = "Selecciona una cuenta para iniciar sesión:",
                            fontSize = 12.5.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        // Main Google User Account Card
                        Surface(
                            onClick = {
                                showGoogleAccountChooser = false
                                if (activity != null) {
                                    viewModel.signInWithGoogle(activity, "adandavid9805@gmail.com", "David Peña") { success ->
                                        if (success) onLoginSuccess()
                                    }
                                } else {
                                    viewModel.signInDirectAccount("adandavid9805@gmail.com", "David Peña")
                                    onLoginSuccess()
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = androidx.compose.foundation.BorderStroke(
                                1.5.dp,
                                BrandIndigo.copy(alpha = 0.35f)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("account_item_david")
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = BrandIndigo,
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = "D",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 18.sp,
                                            color = Color.White
                                        )
                                    }
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "David Peña",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "adandavid9805@gmail.com",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }

                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = IncomeEmerald,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }

                        // Option to Use Another Account
                        Surface(
                            onClick = { isCustomAccountMode = true },
                            shape = RoundedCornerShape(12.dp),
                            color = Color.Transparent,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("btn_use_another_account")
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Default.Add,
                                            contentDescription = null,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }

                                Text(
                                    text = "Usar otra cuenta de Google",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    } else {
                        // Custom Google account input
                        Text(
                            text = "Ingresa los datos de tu cuenta de Google:",
                            fontSize = 12.5.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        OutlinedTextField(
                            value = customName,
                            onValueChange = { customName = it },
                            label = { Text("Nombre Completo") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )

                        OutlinedTextField(
                            value = customEmail,
                            onValueChange = { customEmail = it },
                            label = { Text("Correo Google (@gmail.com)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )

                        TextButton(
                            onClick = { isCustomAccountMode = false },
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("← Volver a cuentas disponibles", fontSize = 12.sp)
                        }
                    }

                    // Security note
                    Text(
                        text = "Para continuar, Google compartirá tu nombre, dirección de correo electrónico y preferencia de idioma con Income Manage.",
                        fontSize = 10.5.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                        lineHeight = 14.sp
                    )
                }
            },
            confirmButton = {
                if (isCustomAccountMode) {
                    Button(
                        onClick = {
                            showGoogleAccountChooser = false
                            if (activity != null) {
                                viewModel.signInWithGoogle(activity, customEmail, customName) { success ->
                                    if (success) onLoginSuccess()
                                }
                            } else {
                                viewModel.signInDirectAccount(customEmail, customName)
                                onLoginSuccess()
                            }
                        },
                        modifier = Modifier.testTag("btn_confirm_custom_google_account")
                    ) {
                        Text("Iniciar Sesión")
                    }
                } else {
                    Button(
                        onClick = {
                            showGoogleAccountChooser = false
                            if (activity != null) {
                                viewModel.signInWithGoogle(activity, "adandavid9805@gmail.com", "David Peña") { success ->
                                    if (success) onLoginSuccess()
                                }
                            } else {
                                viewModel.signInDirectAccount("adandavid9805@gmail.com", "David Peña")
                                onLoginSuccess()
                            }
                        },
                        modifier = Modifier.testTag("btn_continue_as_david")
                    ) {
                        Text("Continuar como David")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showGoogleAccountChooser = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}
