package com.example.incomemanage.ui.screens.actions

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import com.example.incomemanage.ui.viewmodel.SpaceMember

@Composable
fun PassphraseActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val context = LocalContext.current
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"

    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("⚙️ Espacio", "👥 Integrantes", "➕ Crear Espacio")

    val currentSpaceName by (if (isTreasury) viewModel.treasurySpaceName else viewModel.personalSpaceName).collectAsState()
    var spaceNameInput by remember(currentSpaceName) { mutableStateOf(currentSpaceName) }
    var passphraseInput by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    // Members
    val members by viewModel.members.collectAsState()

    // Transfer ownership
    var transferEmail by remember { mutableStateOf("") }
    var showTransferConfirm by remember { mutableStateOf(false) }

    // New Space
    var newSpaceName by remember { mutableStateOf("") }
    var newSpacePass by remember { mutableStateOf("") }
    var copyDataToNewSpace by remember { mutableStateOf(false) }

    if (showTransferConfirm) {
        AlertDialog(
            onDismissRequest = { showTransferConfirm = false },
            title = { Text("Confirmar Transferencia", fontWeight = FontWeight.Bold) },
            text = { Text("¿Estás seguro de transferir la propiedad del espacio a $transferEmail? Perderás los privilegios de administrador supremo.") },
            confirmButton = {
                Button(
                    onClick = {
                        showTransferConfirm = false
                        Toast.makeText(context, "Propiedad transferida a $transferEmail", Toast.LENGTH_LONG).show()
                        transferEmail = ""
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ExpenseRose)
                ) {
                    Text("Transferir")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTransferConfirm = false }) {
                    Text("Cancelar")
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("passphrase_action_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Tab Selector
        item {
            TabRow(
                selectedTabIndex = selectedTab,
                modifier = Modifier.fillMaxWidth()
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title, fontSize = 13.sp, fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal) }
                    )
                }
            }
        }

        when (selectedTab) {
            0 -> {
                // Tab 0: Espacio Activo
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
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text("Configuración de Espacio ($moduleName)", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text(
                                text = "El espacio de trabajo permite sincronizar y respaldar tu información. Deja la passphrase vacía para trabajar en modo local privado.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                                lineHeight = 16.sp
                            )

                            OutlinedTextField(
                                value = spaceNameInput,
                                onValueChange = { spaceNameInput = it },
                                label = { Text("Nombre del Espacio") },
                                placeholder = { Text("Ej. Iglesia Central / Familia") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true
                            )

                            OutlinedTextField(
                                value = passphraseInput,
                                onValueChange = { passphraseInput = it },
                                label = { Text("Passphrase (Frase de acceso)") },
                                placeholder = { Text("Dejar vacía para Cuenta Personal") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = "Mostrar contraseña"
                                        )
                                    }
                                }
                            )

                            Button(
                                onClick = {
                                    if (isTreasury) {
                                        viewModel.setTreasurySpace(spaceNameInput, passphraseInput)
                                    } else {
                                        viewModel.setPersonalSpace(spaceNameInput, passphraseInput)
                                    }
                                    Toast.makeText(context, "Espacio actualizado: $spaceNameInput", Toast.LENGTH_SHORT).show()
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(46.dp),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                            ) {
                                Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Guardar Cambios de Espacio", fontWeight = FontWeight.Bold)
                            }

                            if (spaceNameInput != "Cuenta Personal") {
                                OutlinedButton(
                                    onClick = {
                                        spaceNameInput = "Cuenta Personal"
                                        passphraseInput = ""
                                        if (isTreasury) viewModel.setTreasurySpace("Cuenta Personal", "")
                                        else viewModel.setPersonalSpace("Cuenta Personal", "")
                                        Toast.makeText(context, "Desconectado. Ahora en Cuenta Personal local.", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Desconectarme (Volver a Cuenta Local)")
                                }
                            }
                        }
                    }
                }

                if (isTreasury) {
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
                                Text("Transferir Propiedad del Espacio", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    text = "Asigna a otro miembro como Propietario del espacio de tesorería.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                                )

                                OutlinedTextField(
                                    value = transferEmail,
                                    onValueChange = { transferEmail = it },
                                    label = { Text("Correo electrónico del nuevo propietario") },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp),
                                    singleLine = true
                                )

                                Button(
                                    onClick = { showTransferConfirm = true },
                                    enabled = transferEmail.isNotBlank(),
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = ExpenseRose)
                                ) {
                                    Text("Transferir Propiedad")
                                }
                            }
                        }
                    }
                }
            }

            1 -> {
                // Tab 1: Integrantes y Permisos
                item {
                    Text(
                        text = "Miembros con Acceso al Espacio (${members.size})",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                itemsIndexed(members) { index, member ->
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
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(text = member.name, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                                    Text(text = member.email, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                }

                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = if (member.isBlocked) ExpenseRose.copy(alpha = 0.15f) else accentColor.copy(alpha = 0.15f)
                                ) {
                                    Text(
                                        text = if (member.isBlocked) "Bloqueado" else if (member.readOnly) "Solo Ver" else "Editor",
                                        color = if (member.isBlocked) ExpenseRose else accentColor,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }

                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Permitir Agregar / Crear:", fontSize = 12.sp)
                                Switch(
                                    checked = member.canAdd,
                                    onCheckedChange = { viewModel.updateMemberPermission(index, member.copy(canAdd = it)) }
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Permitir Editar:", fontSize = 12.sp)
                                Switch(
                                    checked = member.canEdit,
                                    onCheckedChange = { viewModel.updateMemberPermission(index, member.copy(canEdit = it)) }
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Permitir Eliminar:", fontSize = 12.sp)
                                Switch(
                                    checked = member.canDelete,
                                    onCheckedChange = { viewModel.updateMemberPermission(index, member.copy(canDelete = it)) }
                                )
                            }
                        }
                    }
                }
            }

            2 -> {
                // Tab 2: Crear Nuevo Espacio
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
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text("Crear Nuevo Espacio de Trabajo", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text(
                                text = "Define un nuevo espacio independiente para gestionar las finanzas de otra sede, ministerio o proyecto.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                                lineHeight = 16.sp
                            )

                            OutlinedTextField(
                                value = newSpaceName,
                                onValueChange = { newSpaceName = it },
                                label = { Text("Nombre del Nuevo Espacio") },
                                placeholder = { Text("Ej. Iglesia Filial Norte") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true
                            )

                            OutlinedTextField(
                                value = newSpacePass,
                                onValueChange = { newSpacePass = it },
                                label = { Text("Passphrase (Contraseña segura)") },
                                placeholder = { Text("Ej. MiClaveSecreta2025") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true
                            )

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Checkbox(
                                    checked = copyDataToNewSpace,
                                    onCheckedChange = { copyDataToNewSpace = it }
                                )
                                Text("Copiar datos del espacio actual al nuevo", fontSize = 12.5.sp)
                            }

                            Button(
                                onClick = {
                                    val trimmedName = newSpaceName.trim()
                                    val trimmedPass = newSpacePass.trim()
                                    if (trimmedName.isNotBlank()) {
                                        if (isTreasury) viewModel.setTreasurySpace(trimmedName, trimmedPass)
                                        else viewModel.setPersonalSpace(trimmedName, trimmedPass)
                                        Toast.makeText(context, "Espacio creado y activado: $trimmedName", Toast.LENGTH_LONG).show()
                                        selectedTab = 0
                                    }
                                },
                                enabled = newSpaceName.isNotBlank(),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(46.dp),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                            ) {
                                Icon(Icons.Default.AddCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Crear y Cambiar al Espacio", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}
