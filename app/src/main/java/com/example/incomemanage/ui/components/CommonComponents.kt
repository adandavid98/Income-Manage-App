package com.example.incomemanage.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.data.FirebaseUserProfile
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.AppScreen

val CategoryPalette = listOf(
    Color(0xFF4F46E5),
    Color(0xFF10B981),
    Color(0xFFF59E0B),
    Color(0xFFEF4444),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
    Color(0xFF06B6D4),
    Color(0xFF14B8A6),
    Color(0xFFF97316),
    Color(0xFF6366F1)
)

@Composable
fun AppHeader(
    currentScreen: AppScreen,
    isDarkTheme: Boolean,
    currentUser: FirebaseUserProfile? = null,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onHome: () -> Unit,
    onSignOut: () -> Unit = {}
) {
    var showLogoutDialog by remember { mutableStateOf(false) }

    val isTreasuryRelated = currentScreen.name.startsWith("TREASURY")
    val isPersonalRelated = currentScreen.name.startsWith("PERSONAL")

    val badgeText = when {
        currentScreen == AppScreen.LOGIN -> null
        currentScreen == AppScreen.TREASURY -> "Tesorería"
        currentScreen == AppScreen.TREASURY_ACTIONS_MENU -> "Tesorería • Acciones"
        isTreasuryRelated -> currentScreen.title
        currentScreen == AppScreen.PERSONAL_FINANCES -> "Personales"
        currentScreen == AppScreen.PERSONAL_ACTIONS_MENU -> "Personales • Acciones"
        currentScreen == AppScreen.PERSONAL_COPILOT -> "Finanzas • Copilot IA"
        isPersonalRelated -> currentScreen.title
        else -> null
    }

    val badgeColor = if (isTreasuryRelated) IncomeEmerald else BrandIndigoBright

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("main_header"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Logo & Title
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .weight(1f)
                    .clickable(enabled = currentScreen != AppScreen.LOGIN && currentScreen != AppScreen.MENU) { onHome() }
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isTreasuryRelated) IncomeEmerald else BrandIndigo),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isTreasuryRelated) Icons.Default.AccountBalance else Icons.Default.AccountBalanceWallet,
                        contentDescription = "Income Manage Logo",
                        tint = Color.White,
                        modifier = Modifier.size(22.dp)
                    )
                }

                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "Income Manage",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        if (badgeText != null) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = badgeColor.copy(alpha = 0.15f)
                            ) {
                                Text(
                                    text = badgeText,
                                    color = badgeColor,
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text(
                        text = "Gestión de ingresos y gastos",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Right Actions
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Back Button (if inside sub-screens or module)
                if (currentScreen != AppScreen.MENU && currentScreen != AppScreen.LOGIN) {
                    FilledTonalButton(
                        onClick = onBack,
                        modifier = Modifier
                            .height(36.dp)
                            .testTag("btn_back_navigation"),
                        contentPadding = PaddingValues(horizontal = 10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Volver",
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = when (currentScreen) {
                                AppScreen.TREASURY, AppScreen.PERSONAL_FINANCES -> "Menú"
                                AppScreen.PERSONAL_COPILOT -> "Finanzas"
                                else -> "Atrás"
                            },
                            fontSize = 12.5.sp
                        )
                    }
                }

                // User Profile & Logout (when logged in)
                if (currentUser != null && currentScreen != AppScreen.LOGIN) {
                    Surface(
                        shape = CircleShape,
                        color = BrandIndigo.copy(alpha = 0.15f),
                        modifier = Modifier
                            .size(32.dp)
                            .testTag("user_avatar_badge"),
                        border = androidx.compose.foundation.BorderStroke(1.dp, BrandIndigo.copy(alpha = 0.3f))
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = (currentUser.displayName.firstOrNull() ?: 'U').uppercase(),
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = BrandIndigoBright
                            )
                        }
                    }

                    IconButton(
                        onClick = { showLogoutDialog = true },
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("btn_logout")
                    ) {
                        Icon(
                            imageVector = Icons.Default.ExitToApp,
                            contentDescription = "Cerrar sesión",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                // Theme Toggle Button
                IconButton(
                    onClick = onToggleTheme,
                    modifier = Modifier
                        .size(36.dp)
                        .testTag("theme_toggle_btn")
                ) {
                    Icon(
                        imageVector = if (isDarkTheme) Icons.Default.WbSunny else Icons.Default.NightlightRound,
                        contentDescription = "Cambiar tema",
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }

    // Confirmation dialog for logging out
    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = {
                Text("¿Cerrar sesión?", fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    text = "¿Estás seguro de que deseas cerrar sesión de ${currentUser?.displayName ?: currentUser?.email}? Volverás a la pantalla de inicio de sesión de Google.",
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showLogoutDialog = false
                        onSignOut()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.testTag("btn_confirm_logout")
                ) {
                    Text("Cerrar Sesión", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
fun SpaceBadgeHeader(
    title: String,
    spaceName: String,
    onSwitchSpace: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
            modifier = Modifier
                .clickable { onSwitchSpace() }
                .testTag("space_switcher_btn")
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.FolderShared,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = BrandIndigoBright
                )
                Text(
                    text = spaceName,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Icon(
                    imageVector = Icons.Default.SwapHoriz,
                    contentDescription = "Cambiar espacio",
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
    }
}

@Composable
fun FilterBar(
    selectedMonth: Int?,
    selectedYear: Int,
    onMonthSelected: (Int?) -> Unit,
    onYearSelected: (Int) -> Unit
) {
    val months = listOf(
        "Todos (Anual)", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    )
    val years = (2024..2028).toList()

    var monthExpanded by remember { mutableStateOf(false) }
    var yearExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Month Selector
        Box(modifier = Modifier.weight(1.4f)) {
            OutlinedButton(
                onClick = { monthExpanded = true },
                modifier = Modifier.fillMaxWidth().height(42.dp),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp)
            ) {
                Text(
                    text = if (selectedMonth == null) "Todos (Anual)" else months[selectedMonth + 1],
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            DropdownMenu(
                expanded = monthExpanded,
                onDismissRequest = { monthExpanded = false }
            ) {
                DropdownMenuItem(
                    text = { Text("Todos (Anual)") },
                    onClick = {
                        onMonthSelected(null)
                        monthExpanded = false
                    }
                )
                for (i in 0..11) {
                    DropdownMenuItem(
                        text = { Text(months[i + 1]) },
                        onClick = {
                            onMonthSelected(i)
                            monthExpanded = false
                        }
                    )
                }
            }
        }

        // Year Selector
        Box(modifier = Modifier.weight(1f)) {
            OutlinedButton(
                onClick = { yearExpanded = true },
                modifier = Modifier.fillMaxWidth().height(42.dp),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp)
            ) {
                Text(
                    text = selectedYear.toString(),
                    fontSize = 13.sp,
                    modifier = Modifier.weight(1f)
                )
                Icon(Icons.Default.ArrowDropDown, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            DropdownMenu(
                expanded = yearExpanded,
                onDismissRequest = { yearExpanded = false }
            ) {
                for (y in years) {
                    DropdownMenuItem(
                        text = { Text(y.toString()) },
                        onClick = {
                            onYearSelected(y)
                            yearExpanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun SummaryCard(
    title: String,
    amountStr: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    accentColor: Color,
    modifier: Modifier = Modifier,
    extraContent: (@Composable () -> Unit)? = null
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Text(
                    text = title,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = amountStr,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = accentColor
            )

            if (extraContent != null) {
                Spacer(modifier = Modifier.height(8.dp))
                extraContent()
            }
        }
    }
}

@Composable
fun DonutCategoryChart(
    categoryTotals: Map<String, Double>,
    modifier: Modifier = Modifier
) {
    val total = categoryTotals.values.sum()
    if (categoryTotals.isEmpty() || total <= 0.0) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .height(180.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "No hay gastos registrados en este período.",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
        }
        return
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Donut Canvas
        Box(
            modifier = Modifier.size(140.dp),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size(120.dp)) {
                var startAngle = -90f
                val strokeWidth = 24.dp.toPx()
                var colorIndex = 0

                categoryTotals.forEach { (_, amount) ->
                    val sweepAngle = ((amount / total) * 360f).toFloat()
                    val color = CategoryPalette[colorIndex % CategoryPalette.size]
                    drawArc(
                        color = color,
                        startAngle = startAngle,
                        sweepAngle = sweepAngle,
                        useCenter = false,
                        style = Stroke(width = strokeWidth)
                    )
                    startAngle += sweepAngle
                    colorIndex++
                }
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Total",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
                Text(
                    text = "RD$ ${String.format(java.util.Locale.US, "%,.0f", total)}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // Legend
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            var colorIndex = 0
            categoryTotals.entries.take(5).forEach { (cat, amount) ->
                val color = CategoryPalette[colorIndex % CategoryPalette.size]
                val pct = (amount / total * 100).toInt()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(color)
                    )
                    Text(
                        text = cat,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "$pct%",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
                colorIndex++
            }
        }
    }
}

@Composable
fun SimpleBarChart(
    income: Double,
    expense: Double,
    modifier: Modifier = Modifier
) {
    val maxVal = maxOf(income, expense, 1.0)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(130.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.Bottom
        ) {
            // Income Bar
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Bottom,
                modifier = Modifier.weight(1f)
            ) {
                val barHeight = ((income / maxVal) * 90).dp
                Text(
                    text = "RD$ ${String.format(java.util.Locale.US, "%,.0f", income)}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = IncomeEmerald
                )
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(barHeight.coerceAtLeast(8.dp))
                        .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                        .background(IncomeEmerald)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text("Ingresos", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }

            // Expense Bar
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Bottom,
                modifier = Modifier.weight(1f)
            ) {
                val barHeight = ((expense / maxVal) * 90).dp
                Text(
                    text = "RD$ ${String.format(java.util.Locale.US, "%,.0f", expense)}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = ExpenseRose
                )
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(barHeight.coerceAtLeast(8.dp))
                        .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                        .background(ExpenseRose)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text("Gastos", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }
        }
    }
}
