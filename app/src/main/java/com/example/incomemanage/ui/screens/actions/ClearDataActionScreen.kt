package com.example.incomemanage.ui.screens.actions

import android.widget.Toast
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

@Composable
fun ClearDataActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val context = LocalContext.current
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"

    var confirmedCheckbox by remember { mutableStateOf(false) }
    var showDialog by remember { mutableStateOf(false) }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("¿Eliminar definitivamente?", fontWeight = FontWeight.Bold, color = ExpenseRose) },
            text = {
                Text("Esta acción eliminará todos los registros del módulo de $moduleName en el espacio activo. No podrás recuperarlos a menos que tengas un archivo de respaldo CSV.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showDialog = false
                        if (isTreasury) {
                            viewModel.clearTreasuryData()
                        } else {
                            viewModel.clearPersonalData()
                        }
                        Toast.makeText(context, "Datos de $moduleName eliminados con éxito", Toast.LENGTH_LONG).show()
                        viewModel.handleBackNavigation()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ExpenseRose)
                ) {
                    Text("Sí, Borrar Todo", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("clear_data_action_screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Warning Header
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = ExpenseRose.copy(alpha = 0.08f)
                ),
                border = androidx.compose.foundation.BorderStroke(1.5.dp, ExpenseRose.copy(alpha = 0.4f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = ExpenseRose,
                            modifier = Modifier.size(28.dp)
                        )
                        Text(
                            text = "Zona de Peligro: Borrado Total",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = ExpenseRose
                        )
                    }

                    Text(
                        text = "Estás a punto de borrar de forma permanente todas las transacciones registradas en el módulo de $moduleName para este espacio de trabajo.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        lineHeight = 18.sp
                    )

                    Text(
                        text = "💡 Recomendación: Ve a la opción 'Exportar Respaldo CSV' antes de continuar para mantener una copia de seguridad en tu dispositivo.",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
                        lineHeight = 16.sp
                    )
                }
            }
        }

        // Confirmation Checkbox
        item {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Checkbox(
                        checked = confirmedCheckbox,
                        onCheckedChange = { confirmedCheckbox = it },
                        modifier = Modifier.testTag("checkbox_confirm_clear")
                    )
                    Text(
                        text = "Entiendo que esta acción es definitiva e irreversible, y confirmo que deseo vaciar todos los datos de $moduleName.",
                        fontSize = 12.5.sp,
                        lineHeight = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // Delete Button
        item {
            Button(
                onClick = { showDialog = true },
                enabled = confirmedCheckbox,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("btn_execute_clear"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ExpenseRose,
                    disabledContainerColor = ExpenseRose.copy(alpha = 0.3f)
                )
            ) {
                Icon(Icons.Default.DeleteForever, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Borrar Definitivamente Todos los Datos", fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }

        item {
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}
