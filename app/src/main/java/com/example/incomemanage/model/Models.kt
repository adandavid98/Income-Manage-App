package com.example.incomemanage.model

data class TreasuryTransaction(
    val id: String,
    val date: String,
    val concept: String,
    val amount: Double,
    val type: String, // "ingreso" or "gasto"
    val category: String,
    val spaceHash: String = "",
    val timestamp: Long = System.currentTimeMillis()
)

data class PersonalExpense(
    val id: String,
    val date: String,
    val concept: String,
    val amount: Double,
    val category: String,
    val type: String, // "fijo" or "variable"
    val status: String, // "pagado" or "pagar"
    val spaceHash: String = "",
    val timestamp: Long = System.currentTimeMillis()
)

data class ActivityLog(
    val id: String,
    val module: String, // "tesoreria" or "personales"
    val action: String,
    val details: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class CategoryItem(
    val name: String,
    val module: String // "tesoreria" or "personales"
)
