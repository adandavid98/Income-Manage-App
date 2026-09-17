package com.example.incomemanage.ui.screens.actions

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun CopilotActionScreen(
    viewModel: FinanceViewModel
) {
    val messages by viewModel.copilotMessages.collectAsState()
    val budget by viewModel.currentBudget.collectAsState()
    val paid by viewModel.personalTotalPaid.collectAsState()
    val pending by viewModel.personalTotalPending.collectAsState()
    val available = budget - paid

    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    val suggestionChips = listOf(
        "📊 ¿Cómo va mi presupuesto?",
        "💡 Consejos de ahorro",
        "💳 Gastos fijos vs variables",
        "📈 ¿Cuál es mi mayor gasto?"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag("copilot_action_screen")
    ) {
        // Quick Return to Personal Finances Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            TextButton(
                onClick = { viewModel.handleBackNavigation() },
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp),
                modifier = Modifier.testTag("btn_copilot_back_to_finances")
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Volver a Finanzas",
                    modifier = Modifier.size(16.dp),
                    tint = BrandIndigoBright
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Volver a Finanzas Personales",
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Medium,
                    color = BrandIndigoBright
                )
            }
        }

        // Financial Metrics Mini Bar
        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.padding(bottom = 8.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Presupuesto", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Text("RD$ ${String.format(Locale.US, "%,.0f", budget)}", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Pagado", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Text("RD$ ${String.format(Locale.US, "%,.0f", paid)}", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = ExpenseRose)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Pendiente", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Text("RD$ ${String.format(Locale.US, "%,.0f", pending)}", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF59E0B))
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Disponible", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    Text("RD$ ${String.format(Locale.US, "%,.0f", available)}", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = IncomeEmerald)
                }
            }
        }

        // Suggestions Scroll Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            suggestionChips.forEach { chipText ->
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = BrandIndigo.copy(alpha = 0.12f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, BrandIndigo.copy(alpha = 0.3f)),
                    modifier = Modifier.clickable {
                        viewModel.sendCopilotMessage(chipText)
                    }
                ) {
                    Text(
                        text = chipText,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = BrandIndigoBright,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Messages List
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 8.dp)
        ) {
            items(messages) { msg ->
                val isUser = msg.sender == "user"

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
                    verticalAlignment = Alignment.Top
                ) {
                    if (!isUser) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(BrandIndigo),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.SmartToy,
                                contentDescription = "Copilot",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }

                    Column(
                        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
                        modifier = Modifier.widthIn(max = 290.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(
                                topStart = 16.dp,
                                topEnd = 16.dp,
                                bottomStart = if (isUser) 16.dp else 4.dp,
                                bottomEnd = if (isUser) 4.dp else 16.dp
                            ),
                            color = if (isUser) BrandIndigo else MaterialTheme.colorScheme.surface,
                            shadowElevation = 1.dp
                        ) {
                            Text(
                                text = msg.text,
                                fontSize = 13.5.sp,
                                lineHeight = 19.sp,
                                color = if (isUser) Color.White else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(14.dp)
                            )
                        }

                        Text(
                            text = timeFormat.format(Date(msg.timestamp)),
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                            modifier = Modifier.padding(top = 2.dp, start = 4.dp, end = 4.dp)
                        )
                    }
                }
            }
        }

        // Input Field Bar
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 4.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp, bottom = 4.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    placeholder = { Text("Escribe una pregunta sobre tus finanzas...", fontSize = 13.sp) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("input_copilot_message"),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BrandIndigo,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                    )
                )

                IconButton(
                    onClick = {
                        val txt = inputText.trim()
                        if (txt.isNotBlank()) {
                            viewModel.sendCopilotMessage(txt)
                            inputText = ""
                        }
                    },
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(BrandIndigo)
                        .testTag("btn_send_copilot_message")
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Enviar",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
