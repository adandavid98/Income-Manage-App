package com.example.incomemanage.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import com.example.incomemanage.model.TreasuryTransaction
import com.example.incomemanage.ui.components.*
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.AppScreen
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import java.util.Locale

@Composable
fun TreasuryScreen(
    viewModel: FinanceViewModel
) {
    val context = LocalContext.current

    val spaceName by viewModel.treasurySpaceName.collectAsState()
    val transactions by viewModel.filteredTreasuryTransactions.collectAsState()
    val totalIncome by viewModel.treasuryTotalIncome.collectAsState()
    val totalExpense by viewModel.treasuryTotalExpense.collectAsState()
    val historicalBalance by viewModel.treasuryHistoricalBalance.collectAsState()
    val categories by viewModel.treasuryCategories.collectAsState()
    val logs by viewModel.activityLogs.collectAsState()

    val selectedMonth by viewModel.treasuryFilterMonth.collectAsState()
    val selectedYear by viewModel.treasuryFilterYear.collectAsState()

    val formDate by viewModel.treasuryFormDate.collectAsState()
    val formConcept by viewModel.treasuryFormConcept.collectAsState()
    val formAmount by viewModel.treasuryFormAmount.collectAsState()
    val formType by viewModel.treasuryFormType.collectAsState()
    val formCategory by viewModel.treasuryFormCategory.collectAsState()
    val editingId by viewModel.editingTreasuryId.collectAsState()

    val monthBalance = totalIncome - totalExpense

    // Category breakdown for charts & reports
    val expenseCategoryTotals = remember(transactions) {
        transactions.filter { it.type == "gasto" }
            .groupBy { it.category }
            .mapValues { entry -> entry.value.sumOf { it.amount } }
    }

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .testTag("dashboard_container"),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(bottom = 8.dp)
        ) {
            // Space Header
            item {
                SpaceBadgeHeader(
                    title = "Gestión de Tesorería",
                    spaceName = spaceName,
                    onSwitchSpace = { viewModel.navigateTo(AppScreen.TREASURY_PASSPHRASE) }
                )
            }

        // Summary Filter & Totals Section
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
                    Text(
                        text = "Resumen Mensual",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    FilterBar(
                        selectedMonth = selectedMonth,
                        selectedYear = selectedYear,
                        onMonthSelected = { viewModel.setTreasuryMonth(it) },
                        onYearSelected = { viewModel.setTreasuryYear(it) }
                    )

                    // 2x2 Grid for summary
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SummaryCard(
                            title = "Ingresos",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.2f", totalIncome)}",
                            icon = Icons.Default.TrendingUp,
                            accentColor = IncomeEmerald,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryCard(
                            title = "Gastos",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.2f", totalExpense)}",
                            icon = Icons.Default.TrendingDown,
                            accentColor = ExpenseRose,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SummaryCard(
                            title = "Saldo del Mes",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.2f", monthBalance)}",
                            icon = Icons.Default.AccountBalance,
                            accentColor = if (monthBalance >= 0) BalanceSky else ExpenseRose,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryCard(
                            title = "Saldo Histórico",
                            amountStr = "RD$ ${String.format(Locale.US, "%,.2f", historicalBalance)}",
                            icon = Icons.Default.Savings,
                            accentColor = HistoricalViolet,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        // Form Section: Registrar Transacción
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.testTag("form_section")
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = if (editingId == null) "Registrar transacción" else "Editar transacción",
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
                            onValueChange = { viewModel.treasuryFormDate.value = it },
                            label = { Text("Fecha (AAAA-MM-DD)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = formAmount,
                            onValueChange = { viewModel.treasuryFormAmount.value = it },
                            label = { Text("Monto") },
                            placeholder = { Text("0.00") },
                            prefix = { Text("RD$ ") },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("t_amount_input"),
                            singleLine = true
                        )
                    }

                    // Concept Input
                    OutlinedTextField(
                        value = formConcept,
                        onValueChange = { viewModel.treasuryFormConcept.value = it },
                        label = { Text("Concepto") },
                        placeholder = { Text("Ej: Ofrenda del culto, Mantenimiento") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("t_concept_input"),
                        singleLine = true
                    )

                    // Common Concept Suggestions Chips
                    val commonConcepts = listOf("Ofrenda del culto", "Diezmo", "Pago de Luz", "Mantenimiento templo", "Donación especial", "Sonido e Instrumentos")
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        commonConcepts.forEach { suggestion ->
                            SuggestionChip(
                                onClick = { viewModel.treasuryFormConcept.value = suggestion },
                                label = { Text(suggestion, fontSize = 11.5.sp) }
                            )
                        }
                    }

                    // Type Selector (Ingreso vs Gasto)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        FilterChip(
                            selected = formType == "ingreso",
                            onClick = { viewModel.treasuryFormType.value = "ingreso" },
                            label = { Text("Ingreso (+)", fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(Icons.Default.AddCircle, contentDescription = null, tint = IncomeEmerald, modifier = Modifier.size(16.dp))
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = IncomeEmerald.copy(alpha = 0.2f),
                                selectedLabelColor = IncomeEmerald
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        FilterChip(
                            selected = formType == "gasto",
                            onClick = { viewModel.treasuryFormType.value = "gasto" },
                            label = { Text("Gasto (-)", fontWeight = FontWeight.SemiBold) },
                            leadingIcon = {
                                Icon(Icons.Default.RemoveCircle, contentDescription = null, tint = ExpenseRose, modifier = Modifier.size(16.dp))
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = ExpenseRose.copy(alpha = 0.2f),
                                selectedLabelColor = ExpenseRose
                            ),
                            modifier = Modifier.weight(1f)
                        )
                    }

                    // Category Selection Chips
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
                                onClick = { viewModel.treasuryFormCategory.value = cat },
                                label = { Text(cat, fontSize = 12.sp) }
                            )
                        }
                    }

                    // Action Buttons
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { viewModel.saveTreasuryTransaction() },
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp)
                                .testTag("btn_submit_form"),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (editingId == null) "Agregar" else "Actualizar")
                        }

                        if (editingId != null) {
                            OutlinedButton(
                                onClick = { viewModel.cancelTreasuryEdit() },
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

        // Analytical Charts Section
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
                        text = "Distribución de Gastos",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    DonutCategoryChart(categoryTotals = expenseCategoryTotals)

                    Divider(modifier = Modifier.padding(vertical = 4.dp))

                    Text(
                        text = "Comparativo Ingresos vs. Gastos",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    SimpleBarChart(income = totalIncome, expense = totalExpense)
                }
            }
        }

        // Transactions List Section
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Transacciones del Mes",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer
                ) {
                    Text(
                        text = "${transactions.size} items",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
        }

        if (transactions.isEmpty()) {
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
                            text = "No hay transacciones registradas para este período.",
                            fontSize = 13.5.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            }
        } else {
            items(transactions, key = { it.id }) { item ->
                TransactionCard(
                    item = item,
                    onEdit = { viewModel.startEditTreasury(item) },
                    onDelete = { viewModel.deleteTreasury(item) }
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
            .testTag("card_goto_treasury_actions")
            .clickable { viewModel.navigateTo(AppScreen.TREASURY_ACTIONS_MENU) }
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
                    .background(IncomeEmerald.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Tune,
                    contentDescription = null,
                    tint = IncomeEmerald,
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
                    text = "Reporte, CSV, Categorías, Passphrase, Auditoría y más",
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
}

@Composable
private fun TransactionCard(
    item: TreasuryTransaction,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val isIncome = item.type == "ingreso"
    val accentColor = if (isIncome) IncomeEmerald else ExpenseRose

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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isIncome) Icons.Default.Add else Icons.Default.Remove,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp)
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

            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = "${if (isIncome) "+" else "-"}RD$ ${String.format(Locale.US, "%,.2f", item.amount)}",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = accentColor
                )

                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
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
