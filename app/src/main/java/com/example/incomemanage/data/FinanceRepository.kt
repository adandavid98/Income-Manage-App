package com.example.incomemanage.data

import android.content.Context
import com.example.incomemanage.model.ActivityLog
import com.example.incomemanage.model.PersonalExpense
import com.example.incomemanage.model.TreasuryTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

class FinanceRepository(context: Context) {

    private val dbHelper = AppDatabaseHelper(context)

    private val _treasuryTransactions = MutableStateFlow<List<TreasuryTransaction>>(emptyList())
    val treasuryTransactions: StateFlow<List<TreasuryTransaction>> = _treasuryTransactions.asStateFlow()

    private val _personalExpenses = MutableStateFlow<List<PersonalExpense>>(emptyList())
    val personalExpenses: StateFlow<List<PersonalExpense>> = _personalExpenses.asStateFlow()

    private val _currentBudget = MutableStateFlow(0.0)
    val currentBudget: StateFlow<Double> = _currentBudget.asStateFlow()

    private val _treasuryCategories = MutableStateFlow<List<String>>(emptyList())
    val treasuryCategories: StateFlow<List<String>> = _treasuryCategories.asStateFlow()

    private val _personalCategories = MutableStateFlow<List<String>>(emptyList())
    val personalCategories: StateFlow<List<String>> = _personalCategories.asStateFlow()

    private val _logs = MutableStateFlow<List<ActivityLog>>(emptyList())
    val logs: StateFlow<List<ActivityLog>> = _logs.asStateFlow()

    suspend fun refreshTreasury(spaceHash: String) = withContext(Dispatchers.IO) {
        _treasuryTransactions.value = dbHelper.getAllTreasury(spaceHash)
        _treasuryCategories.value = dbHelper.getCategories("tesoreria")
    }

    suspend fun refreshPersonal(spaceHash: String, monthYear: String) = withContext(Dispatchers.IO) {
        _personalExpenses.value = dbHelper.getAllPersonalExpenses(spaceHash)
        _currentBudget.value = dbHelper.getPersonalBudget(monthYear, spaceHash)
        _personalCategories.value = dbHelper.getCategories("personales")
    }

    suspend fun saveTreasuryTransaction(item: TreasuryTransaction) = withContext(Dispatchers.IO) {
        dbHelper.insertOrUpdateTreasury(item)
        dbHelper.addLog("tesoreria", "Guardar Transacción", "${item.concept} (${if (item.type == "ingreso") "+" else "-"}RD$ ${item.amount})")
        refreshTreasury(item.spaceHash)
    }

    suspend fun deleteTreasuryTransaction(item: TreasuryTransaction) = withContext(Dispatchers.IO) {
        dbHelper.deleteTreasury(item.id)
        dbHelper.addLog("tesoreria", "Eliminar Transacción", item.concept)
        refreshTreasury(item.spaceHash)
    }

    suspend fun clearTreasuryData(spaceHash: String) = withContext(Dispatchers.IO) {
        dbHelper.clearTreasury(spaceHash)
        dbHelper.addLog("tesoreria", "Limpiar Datos", "Se borraron todas las transacciones")
        refreshTreasury(spaceHash)
    }

    suspend fun savePersonalExpense(item: PersonalExpense, currentMonthYear: String) = withContext(Dispatchers.IO) {
        dbHelper.insertOrUpdatePersonalExpense(item)
        dbHelper.addLog("personales", "Guardar Gasto", "${item.concept} (RD$ ${item.amount})")
        refreshPersonal(item.spaceHash, currentMonthYear)
    }

    suspend fun togglePersonalExpenseStatus(id: String, newStatus: String, spaceHash: String, currentMonthYear: String) = withContext(Dispatchers.IO) {
        dbHelper.updatePersonalExpenseStatus(id, newStatus)
        dbHelper.addLog("personales", "Cambiar Estado Gasto", "Nuevo estado: $newStatus")
        refreshPersonal(spaceHash, currentMonthYear)
    }

    suspend fun deletePersonalExpense(item: PersonalExpense, currentMonthYear: String) = withContext(Dispatchers.IO) {
        dbHelper.deletePersonalExpense(item.id)
        dbHelper.addLog("personales", "Eliminar Gasto", item.concept)
        refreshPersonal(item.spaceHash, currentMonthYear)
    }

    suspend fun clearPersonalData(spaceHash: String, currentMonthYear: String) = withContext(Dispatchers.IO) {
        dbHelper.clearPersonalExpenses(spaceHash)
        dbHelper.addLog("personales", "Limpiar Datos", "Se borraron todos los gastos personales")
        refreshPersonal(spaceHash, currentMonthYear)
    }

    suspend fun setBudget(monthYear: String, spaceHash: String, amount: Double) = withContext(Dispatchers.IO) {
        dbHelper.setPersonalBudget(monthYear, spaceHash, amount)
        _currentBudget.value = amount
    }

    suspend fun addCategory(name: String, module: String) = withContext(Dispatchers.IO) {
        dbHelper.addCategory(name, module)
        if (module == "tesoreria") {
            _treasuryCategories.value = dbHelper.getCategories("tesoreria")
        } else {
            _personalCategories.value = dbHelper.getCategories("personales")
        }
    }

    suspend fun deleteCategory(name: String, module: String) = withContext(Dispatchers.IO) {
        dbHelper.deleteCategory(name, module)
        if (module == "tesoreria") {
            _treasuryCategories.value = dbHelper.getCategories("tesoreria")
        } else {
            _personalCategories.value = dbHelper.getCategories("personales")
        }
    }

    suspend fun loadLogs(module: String) = withContext(Dispatchers.IO) {
        _logs.value = dbHelper.getLogs(module)
    }

    suspend fun importTreasuryCsv(csvText: String, spaceHash: String) = withContext(Dispatchers.IO) {
        val lines = csvText.lines()
        var importedCount = 0
        for (line in lines) {
            val parts = line.split(",").map { it.trim().removeSurrounding("\"") }
            if (parts.size >= 5 && parts[0].matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) {
                val date = parts[0]
                val concept = parts[1]
                val type = if (parts[2].lowercase().contains("ingreso")) "ingreso" else "gasto"
                val category = parts[3]
                val amount = parts[4].replace("RD$", "").replace("$", "").trim().toDoubleOrNull() ?: 0.0
                if (concept.isNotBlank() && amount > 0) {
                    val item = TreasuryTransaction(
                        id = java.util.UUID.randomUUID().toString(),
                        date = date,
                        concept = concept,
                        amount = amount,
                        type = type,
                        category = category.ifBlank { "General" },
                        spaceHash = spaceHash
                    )
                    dbHelper.insertOrUpdateTreasury(item)
                    importedCount++
                }
            }
        }
        dbHelper.addLog("tesoreria", "Importación CSV", "$importedCount transacciones importadas")
        refreshTreasury(spaceHash)
    }

    suspend fun importPersonalExpensesCsv(csvText: String, spaceHash: String, currentMonthYear: String) = withContext(Dispatchers.IO) {
        val lines = csvText.lines()
        var importedCount = 0
        for (line in lines) {
            val parts = line.split(",").map { it.trim().removeSurrounding("\"") }
            if (parts.size >= 5 && parts[0].matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) {
                val date = parts[0]
                val concept = parts[1]
                val amount = parts[2].replace("RD$", "").replace("$", "").trim().toDoubleOrNull() ?: 0.0
                val category = parts[3]
                val type = if (parts[4].lowercase().contains("fijo")) "fijo" else "variable"
                val status = if (parts.size > 5 && parts[5].lowercase().contains("pagado")) "pagado" else "pagar"
                if (concept.isNotBlank() && amount > 0) {
                    val item = PersonalExpense(
                        id = java.util.UUID.randomUUID().toString(),
                        date = date,
                        concept = concept,
                        amount = amount,
                        category = category.ifBlank { "General" },
                        type = type,
                        status = status,
                        spaceHash = spaceHash
                    )
                    dbHelper.insertOrUpdatePersonalExpense(item)
                    importedCount++
                }
            }
        }
        dbHelper.addLog("personales", "Importación CSV", "$importedCount gastos importados")
        refreshPersonal(spaceHash, currentMonthYear)
    }

    suspend fun getTreasuryByYear(year: Int, spaceHash: String): List<TreasuryTransaction> = withContext(Dispatchers.IO) {
        dbHelper.getTreasuryByYear(year, spaceHash)
    }

    suspend fun archiveTreasuryYear(year: Int, spaceHash: String): Int = withContext(Dispatchers.IO) {
        val count = dbHelper.deleteTreasuryByYear(year, spaceHash)
        dbHelper.addLog("tesoreria", "Cierre Anual", "Se archivó el año $year con $count transacciones")
        refreshTreasury(spaceHash)
        count
    }

    suspend fun getPersonalExpensesByYear(year: Int, spaceHash: String): List<PersonalExpense> = withContext(Dispatchers.IO) {
        dbHelper.getPersonalExpensesByYear(year, spaceHash)
    }

    suspend fun archivePersonalYear(year: Int, spaceHash: String, currentMonthYear: String): Int = withContext(Dispatchers.IO) {
        val count = dbHelper.deletePersonalExpensesByYear(year, spaceHash)
        dbHelper.addLog("personales", "Cierre Anual", "Se archivó el año $year con $count gastos")
        refreshPersonal(spaceHash, currentMonthYear)
        count
    }
}
