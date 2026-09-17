package com.example.incomemanage.ui.screens.actions

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ActivityLogsActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val moduleTag = if (isTreasury) "tesoreria" else "personales"
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo

    LaunchedEffect(moduleTag) {
        viewModel.loadLogs(moduleTag)
    }

    val logs by viewModel.activityLogs.collectAsState()
    var searchQuery by remember { mutableStateOf("") }

    val filteredLogs = remember(logs, searchQuery) {
        if (searchQuery.isBlank()) logs
        else logs.filter {
            it.action.contains(searchQuery, ignoreCase = true) ||
                    it.details.contains(searchQuery, ignoreCase = true)
        }
    }

    val logDateFormat = remember { SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("activity_logs_action_screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Header & Search
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = accentColor.copy(alpha = 0.15f)
                            ) {
                                Text(
                                    text = moduleName,
                                    color = accentColor,
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                            Text("Auditoría de Actividad", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }

                        IconButton(
                            onClick = { viewModel.loadLogs(moduleTag) },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refrescar logs", modifier = Modifier.size(18.dp))
                        }
                    }

                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Buscar en el historial...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("input_search_logs"),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )
                }
            }
        }

        // Empty state
        if (filteredLogs.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (searchQuery.isBlank()) "No hay registros de actividad aún." else "No se encontraron resultados para '$searchQuery'",
                            fontSize = 13.5.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            }
        } else {
            items(filteredLogs, key = { it.id }) { log ->
                val actionColor = when {
                    log.action.contains("Crear", ignoreCase = true) || log.action.contains("Agregar", ignoreCase = true) -> IncomeEmerald
                    log.action.contains("Eliminar", ignoreCase = true) || log.action.contains("Borrar", ignoreCase = true) -> ExpenseRose
                    log.action.contains("Import", ignoreCase = true) || log.action.contains("Cierre", ignoreCase = true) -> Color(0xFF8B5CF6)
                    else -> Color(0xFF3B82F6)
                }

                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = actionColor.copy(alpha = 0.15f)
                            ) {
                                Text(
                                    text = log.action,
                                    color = actionColor,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }

                            Text(
                                text = logDateFormat.format(Date(log.timestamp)),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                            )
                        }

                        Text(
                            text = log.details,
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurface,
                            lineHeight = 17.sp
                        )
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}
