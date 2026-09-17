package com.example.incomemanage.ui.screens.actions

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.incomemanage.ui.components.CategoryPalette
import com.example.incomemanage.ui.theme.*
import com.example.incomemanage.ui.viewmodel.FinanceViewModel

@Composable
fun CategoriesActionScreen(
    viewModel: FinanceViewModel,
    isTreasury: Boolean
) {
    val context = LocalContext.current
    val accentColor = if (isTreasury) IncomeEmerald else BrandIndigo
    val moduleTag = if (isTreasury) "tesoreria" else "personales"
    val moduleName = if (isTreasury) "Tesorería" else "Finanzas Personales"

    val categories by (if (isTreasury) viewModel.treasuryCategories else viewModel.personalCategories).collectAsState()

    var newCategoryName by remember { mutableStateOf("") }
    var selectedColorIndex by remember { mutableIntStateOf(0) }
    var categoryToDelete by remember { mutableStateOf<String?>(null) }

    if (categoryToDelete != null) {
        AlertDialog(
            onDismissRequest = { categoryToDelete = null },
            title = { Text("Eliminar Categoría", fontWeight = FontWeight.Bold) },
            text = { Text("¿Deseas eliminar la categoría \"$categoryToDelete\"? Las transacciones que ya la usen no perderán su información.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        val toDel = categoryToDelete ?: return@TextButton
                        categoryToDelete = null
                        viewModel.deleteCategory(toDel, moduleTag)
                        Toast.makeText(context, "Categoría eliminada", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Eliminar", color = ExpenseRose, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { categoryToDelete = null }) {
                    Text("Cancelar")
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("categories_action_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Form Card: Add New Category
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
                            text = "Nueva Categoría",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    OutlinedTextField(
                        value = newCategoryName,
                        onValueChange = { newCategoryName = it },
                        label = { Text("Nombre de la categoría") },
                        placeholder = { Text("Ej. Combustible, Instrumentos, etc.") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("input_category_name"),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )

                    // Color Picker Palette
                    Text("Color de identificación:", fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CategoryPalette.take(7).forEachIndexed { index, color ->
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(CircleShape)
                                    .background(color)
                                    .clickable { selectedColorIndex = index }
                                    .then(
                                        if (selectedColorIndex == index) {
                                            Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                                        } else Modifier
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                if (selectedColorIndex == index) {
                                    Icon(
                                        Icons.Default.Check,
                                        contentDescription = "Seleccionado",
                                        tint = Color.White,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }

                    Button(
                        onClick = {
                            val trimmed = newCategoryName.trim()
                            if (trimmed.isNotBlank()) {
                                viewModel.addCategory(trimmed, moduleTag)
                                newCategoryName = ""
                                Toast.makeText(context, "Categoría agregada con éxito", Toast.LENGTH_SHORT).show()
                            }
                        },
                        enabled = newCategoryName.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp)
                            .testTag("btn_add_category"),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = accentColor)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Agregar Categoría", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Existing Categories List Header
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Categorías Activas (${categories.size})",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // Items
        items(categories, key = { it }) { catName ->
            val color = CategoryPalette[Math.abs(catName.hashCode()) % CategoryPalette.size]

            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("cat_item_$catName")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(color)
                        )
                        Text(
                            text = catName,
                            fontSize = 14.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    IconButton(
                        onClick = { categoryToDelete = catName },
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Eliminar categoría $catName",
                            tint = ExpenseRose.copy(alpha = 0.8f),
                            modifier = Modifier.size(18.dp)
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
