package com.example.incomemanage.ui.screens.actions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import java.io.OutputStreamWriter
import java.util.Locale

@Composable
fun ArchiveYearActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val context = LocalContext.current
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"

    val currentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
    var selectedYear by remember { mutableIntStateOf(currentYear - 1) } // Default to previous year for closing
    val availableYears = listOf(currentYear - 2, currentYear - 1, currentYear, currentYear + 1)

    var yearRecordCount by remember { mutableIntStateOf(0) }
    var yearTotalAmount by remember { mutableDoubleStateOf(0.0) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var pendingCsvToSave by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(selectedYear, isTreasury) {
        if (isTreasury) {
            viewModel.getTreasuryYearSummary(selectedYear) { count, total ->
                yearRecordCount = count
                yearTotalAmount = total
            }
        } else {
            viewModel.getPersonalYearSummary(selectedYear) { count, total ->
                yearRecordCount = count
                yearTotalAmount = total
            }
        }
    }

    val saveArchiveLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("text/csv")
    ) { uri: Uri? ->
        val csv = pendingCsvToSave
        if (uri != null && csv != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                    OutputStreamWriter(outputStream).use { writer ->
                        writer.write(csv)
                    }
                }
                Toast.makeText(context, "Respaldo del año $selectedYear guardado correctamente", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(context, "Error al guardar el archivo: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Confirmar Cierre Anual $selectedYear", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Se cerrarán y archivarán $yearRecordCount transacciones del año $selectedYear por un monto total de RD$ ${String.format(Locale.US, "%,.2f", yearTotalAmount)}.\n\n" +
                            "El sistema generará el archivo de respaldo CSV para que lo guardes o compartas antes de liberar los registros de la base activa.\n\n" +
                            "¿Deseas continuar?"
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        if (isTreasury) {
                            viewModel.executeTreasuryArchive(selectedYear) { csv, _ ->
                                pendingCsvToSave = csv
                                saveArchiveLauncher.launch("archivo_tesoreria_${selectedYear}_${System.currentTimeMillis()}.csv")
                            }
                        } else {
                            viewModel.executePersonalArchive(selectedYear) { csv, _ ->
                                pendingCsvToSave = csv
                                saveArchiveLauncher.launch("archivo_personales_${selectedYear}_${System.currentTimeMillis()}.csv")
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ExpenseRose)
                ) {
                    Text("Cerrar y Archivar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("archive_year_action_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Explanation Header
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
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
                            text = "Cierre y Archivo Anual",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = "El cierre anual permite congelar y archivar los movimientos de un período fiscal completo, generando automáticamente un archivo de respaldo antes de liberar los registros de la base activa.",
                        fontSize = 12.5.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        lineHeight = 17.sp
                    )
                }
            }
        }

        // Year Selector Card
        item {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text("Selecciona el Año a Archivar:", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        availableYears.forEach { yr ->
                            FilterChip(
                                selected = selectedYear == yr,
                                onClick = { selectedYear = yr },
                                label = { Text("$yr", fontWeight = if (selectedYear == yr) FontWeight.Bold else FontWeight.Normal) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                    // Summary statistics
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Transacciones encontradas:", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                        Text("$yearRecordCount registros", fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Monto total acumulado:", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                        Text(
                            "RD$ ${String.format(Locale.US, "%,.2f", yearTotalAmount)}",
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = accentColor
                        )
                    }
                }
            }
        }

        // Automatic Protection Notice
        item {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = IncomeEmerald.copy(alpha = 0.12f),
                border = androidx.compose.foundation.BorderStroke(1.dp, IncomeEmerald.copy(alpha = 0.3f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Security,
                        contentDescription = null,
                        tint = IncomeEmerald,
                        modifier = Modifier.size(22.dp)
                    )
                    Text(
                        text = "Protección Automática: El sistema no borrará los datos hasta que el respaldo CSV del año $selectedYear haya sido generado y guardado.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Action Button
        item {
            Button(
                onClick = { showConfirmDialog = true },
                enabled = yearRecordCount > 0,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("btn_archive_year"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ExpenseRose)
            ) {
                Icon(Icons.Default.Archive, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (yearRecordCount > 0) "Descargar y Archivar Año $selectedYear" else "Sin registros en el año $selectedYear",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        item {
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}
