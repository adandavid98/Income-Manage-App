package com.example.incomemanage.ui.screens.actions

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
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
import com.example.incomemanage.ui.components.FilterBar
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import java.util.Locale

@Composable
fun ReportActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val context = LocalContext.current
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo

    // We observe the current state based on module
    val treasuryTransactions by viewModel.filteredTreasuryTransactions.collectAsState()
    val personalExpenses by viewModel.filteredPersonalExpenses.collectAsState()
    val budget by viewModel.currentBudget.collectAsState()

    val filterMonth = if (isTreasury) {
        viewModel.treasuryFilterMonth.collectAsState().value
    } else {
        viewModel.personalFilterMonth.collectAsState().value
    }

    val filterYear = if (isTreasury) {
        viewModel.treasuryFilterYear.collectAsState().value
    } else {
        viewModel.personalFilterYear.collectAsState().value
    }

    val monthNames = listOf(
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    )
    val periodLabel = if (filterMonth == null) "Todo el año $filterYear" else "${monthNames.getOrNull(filterMonth) ?: ""} $filterYear"

    // Generate formatted report text
    val reportText = remember(isTreasury, filterMonth, filterYear, treasuryTransactions, personalExpenses, budget) {
        val sb = StringBuilder()
        sb.append("=========================================\n")
        sb.append("      INCOME MANAGE - REPORTE OFICIAL    \n")
        sb.append("=========================================\n")
        sb.append("Módulo: ${if (isTreasury) "Tesorería de la Iglesia" else "Finanzas Personales"}\n")
        sb.append("Período: $periodLabel\n")
        sb.append("Fecha de emisión: ${viewModel.dateFormat.format(java.util.Date())}\n")
        sb.append("-----------------------------------------\n\n")

        if (isTreasury) {
            val totalIncome = treasuryTransactions.filter { it.type == "ingreso" }.sumOf { it.amount }
            val totalExpense = treasuryTransactions.filter { it.type == "gasto" }.sumOf { it.amount }
            val net = totalIncome - totalExpense

            sb.append("RESUMEN FINANCIERO:\n")
            sb.append("  (+) Total Ingresos: RD$ ${String.format(Locale.US, "%,.2f", totalIncome)}\n")
            sb.append("  (-) Total Gastos:   RD$ ${String.format(Locale.US, "%,.2f", totalExpense)}\n")
            sb.append("  (=) Balance Neto:   RD$ ${String.format(Locale.US, "%,.2f", net)}\n\n")

            sb.append("DESGLOSE POR CATEGORÍA:\n")
            val byCat = treasuryTransactions.groupBy { it.category }
            if (byCat.isEmpty()) {
                sb.append("  (No hay movimientos registrados en este período)\n")
            } else {
                for ((cat, items) in byCat) {
                    val sum = items.sumOf { it.amount }
                    val inc = items.filter { it.type == "ingreso" }.sumOf { it.amount }
                    val exp = items.filter { it.type == "gasto" }.sumOf { it.amount }
                    sb.append("  • $cat: RD$ ${String.format(Locale.US, "%,.2f", sum)} (Ingresos: RD$ ${String.format(Locale.US, "%,.2f", inc)} | Gastos: RD$ ${String.format(Locale.US, "%,.2f", exp)})\n")
                }
            }

            sb.append("\nDETALLE DE TRANSACCIONES (${treasuryTransactions.size}):\n")
            for (t in treasuryTransactions) {
                val sign = if (t.type == "ingreso") "+" else "-"
                sb.append("  [${t.date}] ${t.concept} (${t.category}): $sign RD$ ${String.format(Locale.US, "%,.2f", t.amount)}\n")
            }
        } else {
            val totalPaid = personalExpenses.filter { it.status == "pagado" }.sumOf { it.amount }
            val totalPending = personalExpenses.filter { it.status == "pagar" }.sumOf { it.amount }
            val totalExpenses = totalPaid + totalPending
            val available = budget - totalPaid
            val pct = if (budget > 0) String.format(Locale.US, "%.1f", (totalPaid / budget) * 100) else "0"

            sb.append("RESUMEN DE PRESUPUESTO Y GASTOS:\n")
            sb.append("  (i) Presupuesto Asignado: RD$ ${String.format(Locale.US, "%,.2f", budget)}\n")
            sb.append("  (x) Total Gastos Pagados: RD$ ${String.format(Locale.US, "%,.2f", totalPaid)} ($pct%)\n")
            sb.append("  (!) Total Pendientes:     RD$ ${String.format(Locale.US, "%,.2f", totalPending)}\n")
            sb.append("  (=) Saldo Disponible:     RD$ ${String.format(Locale.US, "%,.2f", available)}\n\n")

            sb.append("DESGLOSE POR TIPO DE GASTO:\n")
            val fixed = personalExpenses.filter { it.type == "fijo" }
            val variable = personalExpenses.filter { it.type == "variable" }
            sb.append("  • Gastos Fijos (${fixed.size}): RD$ ${String.format(Locale.US, "%,.2f", fixed.sumOf { it.amount })}\n")
            sb.append("  • Gastos Variables (${variable.size}): RD$ ${String.format(Locale.US, "%,.2f", variable.sumOf { it.amount })}\n\n")

            sb.append("DESGLOSE POR CATEGORÍA:\n")
            val byCat = personalExpenses.groupBy { it.category }
            for ((cat, items) in byCat) {
                sb.append("  • $cat: RD$ ${String.format(Locale.US, "%,.2f", items.sumOf { it.amount })}\n")
            }
        }

        sb.append("\n=========================================\n")
        sb.append("  Generado con Income Manage Mobile App  \n")
        sb.append("=========================================\n")
        sb.toString()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("report_action_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Period Filter Card
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
                    Text(
                        text = "Período del Reporte",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    FilterBar(
                        selectedMonth = filterMonth,
                        selectedYear = filterYear,
                        onMonthSelected = {
                            if (isTreasury) viewModel.setTreasuryMonth(it)
                            else viewModel.setPersonalMonth(it)
                        },
                        onYearSelected = {
                            if (isTreasury) viewModel.setTreasuryYear(it)
                            else viewModel.setPersonalYear(it)
                        }
                    )
                }
            }
        }

        // Action Buttons Top
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("Reporte Income Manage", reportText))
                        Toast.makeText(context, "Reporte copiado al portapapeles", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("btn_copy_report"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Copiar Reporte", fontSize = 13.sp)
                }

                OutlinedButton(
                    onClick = {
                        val sendIntent = Intent().apply {
                            action = Intent.ACTION_SEND
                            putExtra(Intent.EXTRA_TEXT, reportText)
                            type = "text/plain"
                        }
                        val shareIntent = Intent.createChooser(sendIntent, "Compartir Reporte Financiero")
                        context.startActivity(shareIntent)
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("btn_share_report"),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Compartir", fontSize = 13.sp)
                }
            }
        }

        // Preview Formatted Report Text
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
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            Icons.Default.Description,
                            contentDescription = null,
                            tint = accentColor,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = "Previsualización del Reporte Formal",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(8.dp)
                            )
                            .border(
                                width = 1.dp,
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                                shape = RoundedCornerShape(8.dp)
                            )
                            .padding(12.dp)
                            .horizontalScroll(rememberScrollState())
                    ) {
                        Text(
                            text = reportText,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.5.sp,
                            lineHeight = 17.sp,
                            color = MaterialTheme.colorScheme.onSurface
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
