package com.example.incomemanage.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.model.ActivityLog
import com.example.incomemanage.ui.theme.ExpenseRose
import com.example.incomemanage.ui.theme.IncomeEmerald
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun ReportsDialog(
    moduleTitle: String,
    periodStr: String,
    incomeTotal: Double,
    expenseTotal: Double,
    balance: Double,
    categoryBreakdown: Map<String, Double>,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.Assessment, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("Reporte Financiero", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 400.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    Text(
                        text = "$moduleTitle • $periodStr",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }

                item {
                    Card(
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Total Ingresos / Presupuesto:", fontSize = 13.sp)
                                Text("RD$ ${String.format(Locale.US, "%,.2f", incomeTotal)}", fontWeight = FontWeight.Bold, color = IncomeEmerald)
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Total Gastos:", fontSize = 13.sp)
                                Text("RD$ ${String.format(Locale.US, "%,.2f", expenseTotal)}", fontWeight = FontWeight.Bold, color = ExpenseRose)
                            }
                            Divider(modifier = Modifier.padding(vertical = 4.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Balance Neto:", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    "RD$ ${String.format(Locale.US, "%,.2f", balance)}",
                                    fontWeight = FontWeight.Bold,
                                    color = if (balance >= 0) IncomeEmerald else ExpenseRose
                                )
                            }
                        }
                    }
                }

                item {
                    Text(
                        text = "Desglose por Categoría",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }

                if (categoryBreakdown.isEmpty()) {
                    item {
                        Text("No hay registros en este período.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                } else {
                    items(categoryBreakdown.toList()) { (cat, amount) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(cat, fontSize = 13.sp)
                            Text("RD$ ${String.format(Locale.US, "%,.2f", amount)}", fontWeight = FontWeight.Medium, fontSize = 13.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val reportText = buildString {
                        append("REPORTE FINANCIERO - $moduleTitle\n")
                        append("Período: $periodStr\n")
                        append("Ingresos / Presupuesto: RD$ ${String.format(Locale.US, "%,.2f", incomeTotal)}\n")
                        append("Gastos: RD$ ${String.format(Locale.US, "%,.2f", expenseTotal)}\n")
                        append("Balance: RD$ ${String.format(Locale.US, "%,.2f", balance)}\n\n")
                        append("Categorías:\n")
                        categoryBreakdown.forEach { (cat, amt) ->
                            append("- $cat: RD$ ${String.format(Locale.US, "%,.2f", amt)}\n")
                        }
                    }
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("Reporte", reportText))
                    Toast.makeText(context, "Reporte copiado al portapapeles", Toast.LENGTH_SHORT).show()
                }
            ) {
                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Copiar Reporte")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cerrar")
            }
        }
    )
}

@Composable
fun CategoriesDialog(
    categories: List<String>,
    onAddCategory: (String) -> Unit,
    onDeleteCategory: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var newCatName by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.Category, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("Configurar Categorías", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = newCatName,
                        onValueChange = { newCatName = it },
                        label = { Text("Nueva categoría") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    Button(
                        onClick = {
                            if (newCatName.isNotBlank()) {
                                onAddCategory(newCatName.trim())
                                newCatName = ""
                            }
                        }
                    ) {
                        Text("Agregar")
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 240.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(categories) { cat ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(cat, fontSize = 13.sp)
                                IconButton(
                                    onClick = { onDeleteCategory(cat) },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Eliminar",
                                        tint = ExpenseRose,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Listo")
            }
        }
    )
}

@Composable
fun ActivityLogsDialog(
    logs: List<ActivityLog>,
    onDismiss: () -> Unit
) {
    val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("Logs de Actividad", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            if (logs.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    Text("No hay actividades registradas.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 350.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(logs) { log ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(log.action, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Text(
                                        timeFormat.format(Date(log.timestamp)),
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                                    )
                                }
                                Text(
                                    log.details,
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
                                    modifier = Modifier.padding(top = 2.dp)
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Cerrar")
            }
        }
    )
}

@Composable
fun PassphraseDialog(
    currentSpaceName: String,
    onSave: (name: String, passphrase: String) -> Unit,
    onDismiss: () -> Unit
) {
    var spaceName by remember { mutableStateOf(if (currentSpaceName == "Cuenta Personal") "" else currentSpaceName) }
    var passphrase by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.VpnKey, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("Espacio / Passphrase", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Configura un espacio o clave compartida para sincronizar o separar tus registros.",
                    fontSize = 12.5.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )

                OutlinedTextField(
                    value = spaceName,
                    onValueChange = { spaceName = it },
                    label = { Text("Nombre del Espacio") },
                    placeholder = { Text("Ej: Parroquia Central, Mi Familia") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = passphrase,
                    onValueChange = { passphrase = it },
                    label = { Text("Passphrase / Clave") },
                    placeholder = { Text("Opcional: clave secreta") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                OutlinedButton(
                    onClick = {
                        onSave("Cuenta Personal", "")
                        onDismiss()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Volver a Cuenta Personal")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(spaceName.ifBlank { "Cuenta Personal" }, passphrase)
                    onDismiss()
                }
            ) {
                Text("Guardar Espacio")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}

@Composable
fun ImportCsvDialog(
    onImport: (csvText: String) -> Unit,
    onDismiss: () -> Unit
) {
    var csvInput by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.FileUpload, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("Importar Respaldo CSV", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Pega el contenido del archivo CSV a importar:",
                    fontSize = 12.5.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
                OutlinedTextField(
                    value = csvInput,
                    onValueChange = { csvInput = it },
                    label = { Text("Contenido CSV") },
                    placeholder = { Text("Fecha,Concepto,Tipo,Categoría,Monto...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    maxLines = 10
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (csvInput.isNotBlank()) {
                        onImport(csvInput)
                        onDismiss()
                    }
                }
            ) {
                Text("Importar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
