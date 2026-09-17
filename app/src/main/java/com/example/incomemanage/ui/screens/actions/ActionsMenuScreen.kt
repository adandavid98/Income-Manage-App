package com.example.incomemanage.ui.screens.actions

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.AppScreen
import com.example.incomemanage.ui.viewmodel.FinanceViewModel

data class ActionItem(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val iconColor: Color,
    val targetScreen: AppScreen,
    val testTag: String
)

@Composable
fun ActionsMenuScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo

    val actions = if (isTreasury) {
        listOf(
            ActionItem(
                title = "Generar Reporte Financiero",
                description = "Resumen formal de ingresos, gastos y balance mensual con desglose por categoría.",
                icon = Icons.Default.Assessment,
                iconColor = Color(0xFF3B82F6),
                targetScreen = AppScreen.TREASURY_REPORT,
                testTag = "action_goto_report"
            ),
            ActionItem(
                title = "Exportar Respaldo (CSV)",
                description = "Descarga, guarda o comparte todas las transacciones en formato CSV seguro.",
                icon = Icons.Default.FileDownload,
                iconColor = Color(0xFF10B981),
                targetScreen = AppScreen.TREASURY_EXPORT,
                testTag = "action_goto_export"
            ),
            ActionItem(
                title = "Importar Respaldo (CSV)",
                description = "Restaura o carga transacciones desde un archivo CSV o pegando texto.",
                icon = Icons.Default.FileUpload,
                iconColor = Color(0xFF8B5CF6),
                targetScreen = AppScreen.TREASURY_IMPORT,
                testTag = "action_goto_import"
            ),
            ActionItem(
                title = "Configurar Categorías",
                description = "Administra las categorías de tesorería y asigna colores personalizados.",
                icon = Icons.Default.Category,
                iconColor = Color(0xFFF59E0B),
                targetScreen = AppScreen.TREASURY_CATEGORIES,
                testTag = "action_goto_categories"
            ),
            ActionItem(
                title = "Configurar Passphrase y Espacios",
                description = "Administra clave de acceso, espacios de trabajo e integrantes con permisos.",
                icon = Icons.Default.VpnKey,
                iconColor = Color(0xFF06B6D4),
                targetScreen = AppScreen.TREASURY_PASSPHRASE,
                testTag = "action_goto_passphrase"
            ),
            ActionItem(
                title = "Logs de Actividad y Auditoría",
                description = "Historial cronológico detallado de modificaciones, registros y administración.",
                icon = Icons.Default.History,
                iconColor = Color(0xFF64748B),
                targetScreen = AppScreen.TREASURY_LOGS,
                testTag = "action_goto_logs"
            ),
            ActionItem(
                title = "Cierre y Archivo Anual",
                description = "Genera el balance anual, descarga el respaldo y libera espacio de la base de datos.",
                icon = Icons.Default.Archive,
                iconColor = Color(0xFFE11D48),
                targetScreen = AppScreen.TREASURY_ARCHIVE,
                testTag = "action_goto_archive"
            ),
            ActionItem(
                title = "Limpiar Datos",
                description = "Borrado permanente y definitivo de las transacciones de este espacio.",
                icon = Icons.Default.DeleteForever,
                iconColor = Color(0xFFEF4444),
                targetScreen = AppScreen.TREASURY_CLEAR,
                testTag = "action_goto_clear"
            )
        )
    } else {
        listOf(
            ActionItem(
                title = "Finanzas Copilot (IA)",
                description = "Asistente inteligente para análisis de presupuesto, gastos fijos y ahorro.",
                icon = Icons.Default.SmartToy,
                iconColor = Color(0xFF8B5CF6),
                targetScreen = AppScreen.PERSONAL_COPILOT,
                testTag = "action_goto_copilot"
            ),
            ActionItem(
                title = "Generar Reporte Personal",
                description = "Balance detallado de presupuesto, gastos fijos vs. variables y saldo disponible.",
                icon = Icons.Default.Assessment,
                iconColor = Color(0xFF3B82F6),
                targetScreen = AppScreen.PERSONAL_REPORT,
                testTag = "action_goto_report"
            ),
            ActionItem(
                title = "Exportar Respaldo (CSV)",
                description = "Descarga, guarda o comparte tus gastos personales en formato CSV.",
                icon = Icons.Default.FileDownload,
                iconColor = Color(0xFF10B981),
                targetScreen = AppScreen.PERSONAL_EXPORT,
                testTag = "action_goto_export"
            ),
            ActionItem(
                title = "Importar Respaldo (CSV)",
                description = "Restaura tus gastos personales desde un archivo CSV o pegando texto.",
                icon = Icons.Default.FileUpload,
                iconColor = Color(0xFF8B5CF6),
                targetScreen = AppScreen.PERSONAL_IMPORT,
                testTag = "action_goto_import"
            ),
            ActionItem(
                title = "Configurar Categorías",
                description = "Administra las categorías de tus gastos y personaliza su paleta de colores.",
                icon = Icons.Default.Category,
                iconColor = Color(0xFFF59E0B),
                targetScreen = AppScreen.PERSONAL_CATEGORIES,
                testTag = "action_goto_categories"
            ),
            ActionItem(
                title = "Configurar Passphrase y Espacios",
                description = "Asigna contraseña para compartir tus finanzas en pareja o cuenta personal.",
                icon = Icons.Default.VpnKey,
                iconColor = Color(0xFF06B6D4),
                targetScreen = AppScreen.PERSONAL_PASSPHRASE,
                testTag = "action_goto_passphrase"
            ),
            ActionItem(
                title = "Logs de Actividad",
                description = "Historial cronológico de cambios y registros en tus finanzas personales.",
                icon = Icons.Default.History,
                iconColor = Color(0xFF64748B),
                targetScreen = AppScreen.PERSONAL_LOGS,
                testTag = "action_goto_logs"
            ),
            ActionItem(
                title = "Cierre y Archivo Anual",
                description = "Genera el balance anual de gastos personales, exporta y archiva el año.",
                icon = Icons.Default.Archive,
                iconColor = Color(0xFFE11D48),
                targetScreen = AppScreen.PERSONAL_ARCHIVE,
                testTag = "action_goto_archive"
            ),
            ActionItem(
                title = "Limpiar Datos Personales",
                description = "Borrado permanente de todos los gastos personales y presupuesto.",
                icon = Icons.Default.DeleteForever,
                iconColor = Color(0xFFEF4444),
                targetScreen = AppScreen.PERSONAL_CLEAR,
                testTag = "action_goto_clear"
            )
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("actions_menu_screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Banner Header
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = accentColor.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = moduleName,
                                color = accentColor,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                        Text(
                            text = "Menú de Acciones",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = "Selecciona una herramienta para abrir su ventana dedicada con todas las funciones.",
                        fontSize = 12.5.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        lineHeight = 17.sp
                    )
                }
            }
        }

        // Action Cards List
        items(actions.size) { index ->
            val action = actions[index]
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag(action.testTag)
                    .clickable { viewModel.navigateTo(action.targetScreen) }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(action.iconColor.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = action.icon,
                            contentDescription = action.title,
                            tint = action.iconColor,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Text(
                            text = action.title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = action.description,
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                            lineHeight = 15.sp
                        )
                    }

                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = "Abrir ventana",
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
