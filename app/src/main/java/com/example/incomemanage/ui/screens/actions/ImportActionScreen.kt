package com.example.incomemanage.ui.screens.actions

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import java.io.BufferedReader
import java.io.InputStreamReader

@Composable
fun ImportActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val context = LocalContext.current
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"

    var csvInputText by remember { mutableStateOf("") }
    var showConfirmDialog by remember { mutableStateOf(false) }

    val openFileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                context.contentResolver.openInputStream(uri)?.use { inputStream ->
                    BufferedReader(InputStreamReader(inputStream)).use { reader ->
                        csvInputText = reader.readText()
                    }
                }
                Toast.makeText(context, "Archivo CSV cargado correctamente", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(context, "Error al leer el archivo: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Validate rows
    val detectedRows = remember(csvInputText) {
        val lines = csvInputText.lines()
        lines.count { line ->
            val parts = line.split(",").map { it.trim().removeSurrounding("\"") }
            parts.size >= 5 && parts[0].matches(Regex("\\d{4}-\\d{2}-\\d{2}"))
        }
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Confirmar Importación", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Se importarán $detectedRows registros al módulo de $moduleName.\n\n" +
                            "¿Deseas proceder con la importación?"
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        if (isTreasury) {
                            viewModel.importTreasuryCsv(csvInputText)
                        } else {
                            viewModel.importPersonalCsv(csvInputText)
                        }
                        Toast.makeText(context, "Importación completada con éxito", Toast.LENGTH_LONG).show()
                        viewModel.handleBackNavigation()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                ) {
                    Text("Importar")
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
            .testTag("import_action_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Instructions Card
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
                            text = "Importación de Datos",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = "Puedes restaurar tus datos seleccionando un archivo CSV previamente exportado o pegando directamente el contenido CSV en el área de texto.",
                        fontSize = 12.5.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                        lineHeight = 17.sp
                    )
                }
            }
        }

        // File Selector Button
        item {
            OutlinedButton(
                onClick = { openFileLauncher.launch(arrayOf("text/csv", "text/comma-separated-values", "text/plain", "*/*")) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("btn_select_csv_file"),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.FolderOpen, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Seleccionar Archivo CSV del Dispositivo", fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
            }
        }

        // Text Area for CSV
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
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("O pegar datos CSV manualmente:", fontSize = 13.5.sp, fontWeight = FontWeight.Medium)
                        if (csvInputText.isNotBlank()) {
                            TextButton(onClick = { csvInputText = "" }, contentPadding = PaddingValues(0.dp)) {
                                Text("Limpiar", fontSize = 12.sp)
                            }
                        }
                    }

                    OutlinedTextField(
                        value = csvInputText,
                        onValueChange = { csvInputText = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .testTag("input_csv_text"),
                        placeholder = {
                            Text(
                                "Fecha,Concepto,Tipo,Categoría,Monto\n2025-01-15,Ofrenda,ingreso,Ofrenda,5000",
                                fontSize = 11.5.sp,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                            )
                        },
                        textStyle = androidx.compose.ui.text.TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.5.sp
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    // Detected Rows Banner
                    if (csvInputText.isNotBlank()) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (detectedRows > 0) IncomeEmerald.copy(alpha = 0.12f) else ExpenseRose.copy(alpha = 0.12f)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = if (detectedRows > 0) Icons.Default.CheckCircle else Icons.Default.Error,
                                    contentDescription = null,
                                    tint = if (detectedRows > 0) IncomeEmerald else ExpenseRose,
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = if (detectedRows > 0) "$detectedRows registros válidos detectados" else "No se detectaron transacciones válidas con formato de fecha (YYYY-MM-DD)",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (detectedRows > 0) IncomeEmerald else ExpenseRose
                                )
                            }
                        }
                    }
                }
            }
        }

        // Warning Alert
        item {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFF59E0B).copy(alpha = 0.12f),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = 0.3f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color(0xFFF59E0B),
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = "Atención: La importación incorporará los registros detectados en tu espacio activo. Los registros duplicados se omitirán o actualizarán de forma segura.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Import Button
        item {
            Button(
                onClick = { showConfirmDialog = true },
                enabled = detectedRows > 0,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("btn_confirm_import"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = accentColor)
            ) {
                Icon(Icons.Default.DownloadDone, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (detectedRows > 0) "Importar $detectedRows Registros" else "Importar Datos",
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
