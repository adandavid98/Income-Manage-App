package com.example.incomemanage.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.model.PersonalExpense
import com.example.incomemanage.ui.components.*
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.AppScreen
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import java.util.Locale

@Composable
fun PersonalFinancesScreen(
    viewModel: FinanceViewModel
) {
    val context = LocalContext.current

    val spaceName by viewModel.personalSpaceName.collectAsState()
    val expenses by viewModel.filteredPersonalExpenses.collectAsState()
    val totalPaid by viewModel.personalTotalPaid.collectAsState()
    val totalPending by viewModel.personalTotalPending.collectAsState()
    val budget by viewModel.currentBudget.collectAsState()
    val categories by viewModel.personalCategories.collectAsState()
    val logs by viewModel.activityLogs.collectAsState()

    val selectedMonth by viewModel.personalFilterMonth.collectAsState()
    val selectedYear by viewModel.personalFilterYear.collectAsState()

    val formDate by viewModel.personalFormDate.collectAsState()
    val formConcept by viewModel.personalFormConcept.collectAsState()
    val formAmount by viewModel.personalFormAmount.collectAsState()
    val formCategory by viewModel.personalFormCategory.collectAsState()
    val formType by viewModel.personalFormType.collectAsState()
    val formStatus by viewModel.personalFormStatus.collectAsState()
    val editingId by viewModel.editingPersonalId.collectAsState()

    var showBudgetDialog by remember { mutableStateOf(false) }
    var budgetInput by remember { mutableStateOf(budget.toString()) }

    val totalExpenses = totalPaid + totalPending
    val remainingBudget = budget - totalPaid
    val budgetProgress = if (budget > 0) (totalPaid / budget).toFloat().coerceIn(0f, 1f) else 0f

    val fixedExpenses = remember(expenses) { expenses.filter { it.type == "fijo" } }
    val variableExpenses = remember(expenses) { expenses.filter { it.type == "variable" } }

    val categoryBreakdown = remember(expenses) {
        expenses.groupBy { it.category }
            .mapValues { entry -> entry.value.sumOf { it.amount } }
    }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .testTag("dashboard_container_pf"),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(bottom = 8.dp)
            ) {
                // Space Header
                item {
                    SpaceBadgeHeader(
                        title = "Finanzas Personales",
                        spaceName = spaceName,
                        onSwitchSpace = { viewModel.navigateTo(AppScreen.PERSONAL_PASSPHRASE) }
                    )
                }

        // Budget & Overview Card
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
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Presupuesto Mensual",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        TextButton(
                            onClick = {
                                budgetInput = if (budget > 0) budget.toInt().toString() else ""
                                showBudgetDialog = true
                            }
                        ) {
                            Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Ajustar Presupuesto", fontSize = 12.sp)
                        }
                    }

                    FilterBar(
                        selectedMonth = selectedMonth,
                        selectedYear = selectedYear,
                        onMonthSelected = { viewModel.setPersonalMonth(it) },
                        onYearSelected = { viewModel.setPersonalYear(it) }
                    )

                    // Budget Progress Banner
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    "Presupuesto asignado:",
                                    fontSize = 12.5.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                )
                                Text(
                                    "RD$ ${String.format(Locale.US, "%,.2f", budget)}",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = BrandIndigoBright
                                )
                            }

                            LinearProgressIndicator(
                                progress = { budgetProgress },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(8.dp)
                                    .clip(RoundedCornerShape(4.dp)),
                                color = if (budgetProgress > 0.9f) ExpenseRose else IncomeEmerald,
                                trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    "${(budgetProgress * 100).toInt()}% utilizado",
                                    fontSize = 11.5.sp,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                                Text(
                                    "Restante: RD$ ${String.format(Locale.US, "%,.2f", remainingBudget)}",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (remainingBudget >= 0) IncomeEmerald else ExpenseRose
                                )
                            }
                        }
                    }

                    // 3 Metric Cards
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        SummaryCard(
                            title = "Pagados",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.0f", totalPaid)}",
                            icon = Icons.Default.CheckCircle,
                            accentColor = IncomeEmerald,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryCard(
                            title = "Pendientes",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.0f", totalPending)}",
                            icon = Icons.Default.Schedule,
                            accentColor = PendingOrange,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryCard(
                            title = "Disponible",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.0f", remainingBudget)}",
                            icon = Icons.Default.AccountBalanceWallet,
                            accentColor = if (remainingBudget >= 0) BalanceSky else ExpenseRose,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        // Form: Registrar Gasto Personal
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.testTag("form_section_pf")
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = if (editingId == null) "Registrar gasto personal" else "Editar gasto personal",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    // Date & Amount
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedTextField(
                            value = formDate,
                            onValueChange = { viewModel.personalFormDate.value = it },
                            label = { Text("Fecha (AAAA-MM-DD)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = formAmount,
                            onValueChange = { viewModel.personalFormAmount.value = it },
                            label = { Text("Monto") },
                            placeholder = { Text("0.00") },
                            prefix = { Text("RD$ ") },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("pf_amount_input"),
                            singleLine = true
                        )
                    }

                    // Concept Input
                    OutlinedTextField(
                        value = formConcept,
                        onValueChange = { viewModel.personalFormConcept.value = it },
                        label = { Text("Concepto") },
                        placeholder = { Text("Ej: Internet, Supermercado, Alquiler") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("pf_concept_input"),
                        singleLine = true
                    )

                    // Fast suggestions chips
                    val commonPersonalConcepts = listOf("Alquiler", "Supermercado", "Internet", "Luz", "Combustible", "Salud / Farmacia", "Comida fuera")
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        commonPersonalConcepts.forEach { suggestion ->
                            SuggestionChip(
                                onClick = { viewModel.personalFormConcept.value = suggestion },
                                label = { Text(suggestion, fontSize = 11.5.sp) }
                            )
                        }
                    }

                    // Expense Type (Fijo vs Variable)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        FilterChip(
                            selected = formType == "fijo",
                            onClick = { viewModel.personalFormType.value = "fijo" },
                            label = { Text("Gasto Fijo", fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(Icons.Default.PushPin, contentDescription = null, modifier = Modifier.size(16.dp))
                            },
                            modifier = Modifier.weight(1f)
                        )
                        FilterChip(
                            selected = formType == "variable",
                            onClick = { viewModel.personalFormType.value = "variable" },
                            label = { Text("Gasto Variable", fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(Icons.Default.ShoppingBag, contentDescription = null, modifier = Modifier.size(16.dp))
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    // Status (Pagar vs Pagado)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        FilterChip(
                            selected = formStatus == "pagar",
                            onClick = { viewModel.personalFormStatus.value = "pagar" },
                            label = { Text("Por Pagar (Pendiente)", fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(Icons.Default.HourglassBottom, contentDescription = null, tint = PendingOrange, modifier = Modifier.size(16.dp))
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PendingOrange.copy(alpha = 0.2f),
                                selectedLabelColor = PendingOrange
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        FilterChip(
                            selected = formStatus == "pagado",
                            onClick = { viewModel.personalFormStatus.value = "pagado" },
                            label = { Text("Pagado (Completado)", fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = IncomeEmerald, modifier = Modifier.size(16.dp))
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = IncomeEmerald.copy(alpha = 0.2f),
                                selectedLabelColor = IncomeEmerald
                            ),
                            modifier = Modifier.weight(1f)
                        )
                    }

                    // Category Chips
                    Text("Categoría:", fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        categories.forEach { cat ->
                            FilterChip(
                                selected = formCategory == cat,
                                onClick = { viewModel.personalFormCategory.value = cat },
                                label = { Text(cat, fontSize = 12.sp) }
                            )
                        }
                    }

                    // Buttons
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { viewModel.savePersonalExpense() },
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp)
                                .testTag("btn_submit_pf"),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (editingId == null) "Registrar Gasto" else "Actualizar Gasto")
                        }

                        if (editingId != null) {
                            OutlinedButton(
                                onClick = { viewModel.cancelPersonalEdit() },
                                modifier = Modifier.height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("Cancelar")
                            }
                        }
                    }
                }
            }
        }

        // Charts
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
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "Gastos por Categoría",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    DonutCategoryChart(categoryTotals = categoryBreakdown)

                    Divider(modifier = Modifier.padding(vertical = 4.dp))

                    Text(
                        text = "Presupuesto vs. Gastos Totales",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    SimpleBarChart(income = budget, expense = totalExpenses)
                }
            }
        }

        // Section: Gastos Fijos
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.PushPin, contentDescription = null, tint = BrandIndigoBright, modifier = Modifier.size(18.dp))
                    Text("Gastos Fijos", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }
                Surface(
                    shape = CircleShape,
                    color = BrandIndigo.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = "${fixedExpenses.size} gastos",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = BrandIndigoBright,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
        }

        if (fixedExpenses.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text("No hay gastos fijos registrados.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    }
                }
            }
        } else {
            items(fixedExpenses, key = { it.id }) { item ->
                PersonalExpenseCard(
                    item = item,
                    onToggleStatus = { viewModel.togglePersonalExpenseStatus(item) },
                    onEdit = { viewModel.startEditPersonal(item) },
                    onDelete = { viewModel.deletePersonal(item) }
                )
            }
        }

        // Section: Gastos Variables
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 4.dp, end = 4.dp, top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.ShoppingBag, contentDescription = null, tint = HistoricalViolet, modifier = Modifier.size(18.dp))
                    Text("Gastos Variables / Imprevistos", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }
                Surface(
                    shape = CircleShape,
                    color = HistoricalViolet.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = "${variableExpenses.size} gastos",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = HistoricalViolet,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
        }

        if (variableExpenses.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text("No hay gastos variables registrados.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    }
                }
            }
        } else {
            items(variableExpenses, key = { it.id }) { item ->
                PersonalExpenseCard(
                    item = item,
                    onToggleStatus = { viewModel.togglePersonalExpenseStatus(item) },
                    onEdit = { viewModel.startEditPersonal(item) },
                    onDelete = { viewModel.deletePersonal(item) }
                )
            }
        }
    }

    // Fixed Action Submenu Bar at Bottom
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 6.dp, bottom = 2.dp)
            .testTag("card_goto_personal_actions")
            .clickable { viewModel.navigateTo(AppScreen.PERSONAL_ACTIONS_MENU) }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(BrandIndigo.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Tune,
                    contentDescription = null,
                    tint = BrandIndigo,
                    modifier = Modifier.size(22.dp)
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = "Menú de Acciones y Herramientas",
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Reportes, CSV, Categorías, Passphrase, Auditoría y más",
                    fontSize = 11.5.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "Abrir submenú",
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

// Floating Chatbot / Copilot Button in bottom-right corner
ExtendedFloatingActionButton(
    onClick = { viewModel.navigateTo(AppScreen.PERSONAL_COPILOT) },
    icon = {
        Icon(
            imageVector = Icons.Default.SmartToy,
            contentDescription = "Finanzas Copilot IA",
            tint = Color.White,
            modifier = Modifier.size(22.dp)
        )
    },
    text = {
        Text(
            text = "Copilot IA",
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 13.5.sp
        )
    },
    containerColor = BrandIndigo,
    contentColor = Color.White,
    elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp),
    modifier = Modifier
        .align(Alignment.BottomEnd)
        .padding(bottom = 76.dp, end = 10.dp)
        .testTag("fab_personal_copilot")
)
}

    // Budget Dialog
    if (showBudgetDialog) {
        AlertDialog(
            onDismissRequest = { showBudgetDialog = false },
            title = { Text("Ajustar Presupuesto Mensual", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = budgetInput,
                    onValueChange = { budgetInput = it },
                    label = { Text("Presupuesto del mes") },
                    prefix = { Text("RD$ ") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        val amount = budgetInput.toDoubleOrNull() ?: 0.0
                        viewModel.updateBudget(amount)
                        showBudgetDialog = false
                    }
                ) {
                    Text("Guardar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBudgetDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
private fun PersonalExpenseCard(
    item: PersonalExpense,
    onToggleStatus: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val isPaid = item.status == "pagado"
    val statusColor = if (isPaid) IncomeEmerald else PendingOrange

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // Left info
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.weight(1f)
            ) {
                // Status icon toggle
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(statusColor.copy(alpha = 0.15f))
                        .clickable { onToggleStatus() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isPaid) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                        contentDescription = "Cambiar estado",
                        tint = statusColor,
                        modifier = Modifier.size(20.dp)
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.concept,
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = item.date,
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                        )
                        Text("•", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        ) {
                            Text(
                                text = item.category,
                                fontSize = 10.5.sp,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                            )
                        }
                    }
                }
            }

            // Right: Amount and actions
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = "RD$ ${String.format(Locale.US, "%,.2f", item.amount)}",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Status Badge (click to toggle)
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = statusColor.copy(alpha = 0.15f),
                        modifier = Modifier.clickable { onToggleStatus() }
                    ) {
                        Text(
                            text = if (isPaid) "Pagado" else "Pagar",
                            color = statusColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }

                    IconButton(
                        onClick = onEdit,
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = "Editar",
                            modifier = Modifier.size(15.dp),
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }

                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Eliminar",
                            modifier = Modifier.size(15.dp),
                            tint = ExpenseRose.copy(alpha = 0.8f)
                        )
                    }
                }
            }
        }
    }
}
