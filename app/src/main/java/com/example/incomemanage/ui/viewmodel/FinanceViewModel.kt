package com.example.incomemanage.ui.viewmodel

import android.app.Activity
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.incomemanage.data.FirebaseAuthManager
import com.example.incomemanage.data.FirebaseUserProfile
import com.example.incomemanage.data.FinanceRepository
import com.example.incomemanage.data.FirestoreManager
import com.example.incomemanage.model.ActivityLog
import com.example.incomemanage.model.PersonalExpense
import com.example.incomemanage.model.TreasuryTransaction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID

data class CopilotMessage(
    val sender: String, // "user" or "copilot"
    val text: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class SpaceMember(
    val name: String,
    val email: String,
    val canAdd: Boolean = true,
    val canEdit: Boolean = true,
    val canDelete: Boolean = false,
    val readOnly: Boolean = false,
    val isBlocked: Boolean = false
)

enum class AppScreen(val title: String) {
    LOGIN("Iniciar Sesión"),
    MENU("Menú Principal"),
    TREASURY("Tesorería"),
    PERSONAL_FINANCES("Finanzas Personales"),

    // Treasury Actions Sub-Menu & Windows
    TREASURY_ACTIONS_MENU("Acciones Generales"),
    TREASURY_REPORT("Generar Reporte"),
    TREASURY_EXPORT("Exportar Respaldo CSV"),
    TREASURY_IMPORT("Importar Respaldo CSV"),
    TREASURY_CATEGORIES("Configurar Categorías"),
    TREASURY_PASSPHRASE("Configurar Passphrase y Espacio"),
    TREASURY_LOGS("Logs de Actividad"),
    TREASURY_ARCHIVE("Cierre y Archivo Anual"),
    TREASURY_CLEAR("Limpiar Datos"),

    // Personal Finances Actions Sub-Menu & Windows
    PERSONAL_ACTIONS_MENU("Acciones Generales"),
    PERSONAL_REPORT("Generar Reporte"),
    PERSONAL_EXPORT("Exportar Respaldo CSV"),
    PERSONAL_IMPORT("Importar Respaldo CSV"),
    PERSONAL_CATEGORIES("Configurar Categorías"),
    PERSONAL_PASSPHRASE("Configurar Passphrase y Espacio"),
    PERSONAL_LOGS("Logs de Actividad"),
    PERSONAL_ARCHIVE("Cierre y Archivo Anual"),
    PERSONAL_CLEAR("Limpiar Datos"),
    PERSONAL_COPILOT("Finanzas Copilot")
}

class FinanceViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = FinanceRepository(application.applicationContext)

    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

    // --- Firebase Auth Integration ---
    val currentUser: StateFlow<FirebaseUserProfile?> = FirebaseAuthManager.currentUser
    val isAuthenticating: StateFlow<Boolean> = FirebaseAuthManager.isAuthenticating
    private val _authErrorMessage = MutableStateFlow<String?>(null)
    val authErrorMessage: StateFlow<String?> = _authErrorMessage.asStateFlow()

    // --- App Configuration State ---
    private val _isDarkTheme = MutableStateFlow(true)
    val isDarkTheme: StateFlow<Boolean> = _isDarkTheme.asStateFlow()

    private val _currentScreen = MutableStateFlow(
        if (FirebaseAuthManager.currentUser.value != null) AppScreen.MENU else AppScreen.LOGIN
    )
    val currentScreen: StateFlow<AppScreen> = _currentScreen.asStateFlow()

    init {
        FirebaseAuthManager.init(application)
        if (FirebaseAuthManager.currentUser.value != null) {
            _currentScreen.value = AppScreen.MENU
            triggerFirestoreSync()
        }
    }

    fun triggerFirestoreSync() {
        val uid = FirebaseAuthManager.currentUser.value?.uid ?: ""
        repository.startFirestoreSync(
            userId = uid,
            treasurySpaceHash = _treasurySpaceHash.value,
            personalSpaceHash = _personalSpaceHash.value
        )
    }

    fun signInWithGoogle(
        activity: Activity,
        email: String = "adandavid9805@gmail.com",
        displayName: String = "David Peña",
        onComplete: (Boolean) -> Unit = {}
    ) {
        _authErrorMessage.value = null
        FirebaseAuthManager.signInWithGoogle(activity, email, displayName) { success, message ->
            if (success) {
                _currentScreen.value = AppScreen.MENU
                snackbarMessage.value = "Sesión iniciada con Google exitosamente."
                triggerFirestoreSync()
                onComplete(true)
            } else {
                _authErrorMessage.value = message
                onComplete(false)
            }
        }
    }

    fun signInDirectAccount(email: String, name: String) {
        FirebaseAuthManager.signInWithDirectAccount(getApplication(), email, name)
        _currentScreen.value = AppScreen.MENU
        snackbarMessage.value = "Bienvenido, ${FirebaseAuthManager.currentUser.value?.displayName ?: email}"
        triggerFirestoreSync()
    }

    fun signOut() {
        FirestoreManager.stopListeners()
        FirebaseAuthManager.signOut(getApplication())
        _currentScreen.value = AppScreen.LOGIN
        snackbarMessage.value = "Has cerrado sesión correctamente."
    }

    fun clearAuthError() {
        _authErrorMessage.value = null
    }

    private val _currencySymbol = MutableStateFlow("RD$")
    val currencySymbol: StateFlow<String> = _currencySymbol.asStateFlow()

    // --- Active Workspace / Space ---
    private val _treasurySpaceName = MutableStateFlow("Cuenta Personal")
    val treasurySpaceName: StateFlow<String> = _treasurySpaceName.asStateFlow()
    private val _treasurySpaceHash = MutableStateFlow("")

    private val _personalSpaceName = MutableStateFlow("Cuenta Personal")
    val personalSpaceName: StateFlow<String> = _personalSpaceName.asStateFlow()
    private val _personalSpaceHash = MutableStateFlow("")

    // --- Filters ---
    private val calendar = Calendar.getInstance()
    val currentYear = calendar.get(Calendar.YEAR)
    val currentMonth = calendar.get(Calendar.MONTH) // 0-11

    private val _treasuryFilterMonth = MutableStateFlow<Int?>(currentMonth)
    val treasuryFilterMonth: StateFlow<Int?> = _treasuryFilterMonth.asStateFlow()

    private val _treasuryFilterYear = MutableStateFlow(currentYear)
    val treasuryFilterYear: StateFlow<Int> = _treasuryFilterYear.asStateFlow()

    private val _personalFilterMonth = MutableStateFlow<Int?>(currentMonth)
    val personalFilterMonth: StateFlow<Int?> = _personalFilterMonth.asStateFlow()

    private val _personalFilterYear = MutableStateFlow(currentYear)
    val personalFilterYear: StateFlow<Int> = _personalFilterYear.asStateFlow()

    // --- Data Streams from Repository ---
    val treasuryTransactions = repository.treasuryTransactions
    val treasuryCategories = repository.treasuryCategories
    val personalExpenses = repository.personalExpenses
    val personalCategories = repository.personalCategories
    val currentBudget = repository.currentBudget
    val activityLogs = repository.logs

    // --- Filtered Treasury Transactions ---
    val filteredTreasuryTransactions: StateFlow<List<TreasuryTransaction>> = combine(
        treasuryTransactions,
        _treasuryFilterMonth,
        _treasuryFilterYear
    ) { list, month, year ->
        list.filter { item ->
            val parts = item.date.split("-")
            if (parts.size >= 2) {
                val itemYear = parts[0].toIntOrNull() ?: -1
                val itemMonth = (parts[1].toIntOrNull() ?: 0) - 1
                val matchesYear = itemYear == year
                val matchesMonth = month == null || itemMonth == month
                matchesYear && matchesMonth
            } else true
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // --- Treasury Totals ---
    val treasuryTotalIncome: StateFlow<Double> = filteredTreasuryTransactions.combine(filteredTreasuryTransactions) { list, _ ->
        list.filter { it.type == "ingreso" }.sumOf { it.amount }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val treasuryTotalExpense: StateFlow<Double> = filteredTreasuryTransactions.combine(filteredTreasuryTransactions) { list, _ ->
        list.filter { it.type == "gasto" }.sumOf { it.amount }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val treasuryHistoricalBalance: StateFlow<Double> = treasuryTransactions.combine(treasuryTransactions) { list, _ ->
        list.sumOf { if (it.type == "ingreso") it.amount else -it.amount }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    // --- Filtered Personal Expenses ---
    val filteredPersonalExpenses: StateFlow<List<PersonalExpense>> = combine(
        personalExpenses,
        _personalFilterMonth,
        _personalFilterYear
    ) { list, month, year ->
        list.filter { item ->
            val parts = item.date.split("-")
            if (parts.size >= 2) {
                val itemYear = parts[0].toIntOrNull() ?: -1
                val itemMonth = (parts[1].toIntOrNull() ?: 0) - 1
                val matchesYear = itemYear == year
                val matchesMonth = month == null || itemMonth == month
                matchesYear && matchesMonth
            } else true
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val personalTotalPaid: StateFlow<Double> = filteredPersonalExpenses.combine(filteredPersonalExpenses) { list, _ ->
        list.filter { it.status == "pagado" }.sumOf { it.amount }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val personalTotalPending: StateFlow<Double> = filteredPersonalExpenses.combine(filteredPersonalExpenses) { list, _ ->
        list.filter { it.status == "pagar" }.sumOf { it.amount }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    // --- Treasury Form State ---
    var treasuryFormDate = MutableStateFlow(dateFormat.format(Date()))
    var treasuryFormConcept = MutableStateFlow("")
    var treasuryFormAmount = MutableStateFlow("")
    var treasuryFormType = MutableStateFlow("ingreso")
    var treasuryFormCategory = MutableStateFlow("General")
    var editingTreasuryId = MutableStateFlow<String?>(null)

    // --- Personal Form State ---
    var personalFormDate = MutableStateFlow(dateFormat.format(Date()))
    var personalFormConcept = MutableStateFlow("")
    var personalFormAmount = MutableStateFlow("")
    var personalFormCategory = MutableStateFlow("General")
    var personalFormType = MutableStateFlow("fijo")
    var personalFormStatus = MutableStateFlow("pagar")
    var editingPersonalId = MutableStateFlow<String?>(null)

    // --- Dialogs & UI Modals ---
    val showReportDialog = MutableStateFlow(false)
    val showCategoriesDialog = MutableStateFlow(false)
    val showLogsDialog = MutableStateFlow(false)
    val showPassphraseDialog = MutableStateFlow(false)
    val showClearConfirmation = MutableStateFlow(false)
    val snackbarMessage = MutableStateFlow<String?>(null)

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            repository.refreshTreasury(_treasurySpaceHash.value)
            val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
            repository.refreshPersonal(_personalSpaceHash.value, monthKey)
        }
    }

    private fun getPersonalMonthKey(year: Int, month: Int?): String {
        return if (month == null) "year-$year" else String.format(Locale.US, "%04d-%02d", year, month + 1)
    }

    fun toggleTheme() {
        _isDarkTheme.value = !_isDarkTheme.value
    }

    fun navigateTo(screen: AppScreen) {
        _currentScreen.value = screen
        if (screen == AppScreen.TREASURY) {
            viewModelScope.launch { repository.refreshTreasury(_treasurySpaceHash.value) }
        } else if (screen == AppScreen.PERSONAL_FINANCES) {
            val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
            viewModelScope.launch { repository.refreshPersonal(_personalSpaceHash.value, monthKey) }
        }
    }

    // --- Treasury Filters ---
    fun setTreasuryMonth(month: Int?) {
        _treasuryFilterMonth.value = month
    }

    fun setTreasuryYear(year: Int) {
        _treasuryFilterYear.value = year
    }

    // --- Personal Filters ---
    fun setPersonalMonth(month: Int?) {
        _personalFilterMonth.value = month
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, month)
        viewModelScope.launch {
            repository.refreshPersonal(_personalSpaceHash.value, monthKey)
        }
    }

    fun setPersonalYear(year: Int) {
        _personalFilterYear.value = year
        val monthKey = getPersonalMonthKey(year, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.refreshPersonal(_personalSpaceHash.value, monthKey)
        }
    }

    // --- Personal Budget ---
    fun updateBudget(amount: Double) {
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.setBudget(monthKey, _personalSpaceHash.value, amount)
            snackbarMessage.value = "Presupuesto actualizado: RD$ $amount"
        }
    }

    // --- Treasury Form Operations ---
    fun saveTreasuryTransaction() {
        val concept = treasuryFormConcept.value.trim()
        val amount = treasuryFormAmount.value.toDoubleOrNull() ?: 0.0
        val date = treasuryFormDate.value.trim()
        val type = treasuryFormType.value
        val category = treasuryFormCategory.value.trim().ifBlank { "General" }

        if (concept.isBlank() || amount <= 0.0) {
            snackbarMessage.value = "Por favor ingrese un concepto y un monto válido."
            return
        }

        val id = editingTreasuryId.value ?: UUID.randomUUID().toString()
        val item = TreasuryTransaction(
            id = id,
            date = date,
            concept = concept,
            amount = amount,
            type = type,
            category = category,
            spaceHash = _treasurySpaceHash.value
        )

        viewModelScope.launch {
            repository.saveTreasuryTransaction(item)
            cancelTreasuryEdit()
            snackbarMessage.value = "Transacción guardada exitosamente."
        }
    }

    fun startEditTreasury(item: TreasuryTransaction) {
        editingTreasuryId.value = item.id
        treasuryFormDate.value = item.date
        treasuryFormConcept.value = item.concept
        treasuryFormAmount.value = item.amount.toString()
        treasuryFormType.value = item.type
        treasuryFormCategory.value = item.category
    }

    fun cancelTreasuryEdit() {
        editingTreasuryId.value = null
        treasuryFormConcept.value = ""
        treasuryFormAmount.value = ""
        treasuryFormDate.value = dateFormat.format(Date())
        treasuryFormCategory.value = "General"
    }

    fun deleteTreasury(item: TreasuryTransaction) {
        viewModelScope.launch {
            repository.deleteTreasuryTransaction(item)
            snackbarMessage.value = "Transacción eliminada."
        }
    }

    fun clearTreasuryData() {
        viewModelScope.launch {
            repository.clearTreasuryData(_treasurySpaceHash.value)
            snackbarMessage.value = "Datos de tesorería limpiados."
        }
    }

    // --- Personal Expense Operations ---
    fun savePersonalExpense() {
        val concept = personalFormConcept.value.trim()
        val amount = personalFormAmount.value.toDoubleOrNull() ?: 0.0
        val date = personalFormDate.value.trim()
        val category = personalFormCategory.value.trim().ifBlank { "General" }
        val type = personalFormType.value
        val status = personalFormStatus.value

        if (concept.isBlank() || amount <= 0.0) {
            snackbarMessage.value = "Por favor ingrese un concepto y un monto válido."
            return
        }

        val id = editingPersonalId.value ?: UUID.randomUUID().toString()
        val item = PersonalExpense(
            id = id,
            date = date,
            concept = concept,
            amount = amount,
            category = category,
            type = type,
            status = status,
            spaceHash = _personalSpaceHash.value
        )

        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.savePersonalExpense(item, monthKey)
            cancelPersonalEdit()
            snackbarMessage.value = "Gasto registrado exitosamente."
        }
    }

    fun togglePersonalExpenseStatus(item: PersonalExpense) {
        val nextStatus = if (item.status == "pagado") "pagar" else "pagado"
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.togglePersonalExpenseStatus(item.id, nextStatus, _personalSpaceHash.value, monthKey)
        }
    }

    fun startEditPersonal(item: PersonalExpense) {
        editingPersonalId.value = item.id
        personalFormDate.value = item.date
        personalFormConcept.value = item.concept
        personalFormAmount.value = item.amount.toString()
        personalFormCategory.value = item.category
        personalFormType.value = item.type
        personalFormStatus.value = item.status
    }

    fun cancelPersonalEdit() {
        editingPersonalId.value = null
        personalFormConcept.value = ""
        personalFormAmount.value = ""
        personalFormDate.value = dateFormat.format(Date())
        personalFormCategory.value = "General"
    }

    fun deletePersonal(item: PersonalExpense) {
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.deletePersonalExpense(item, monthKey)
            snackbarMessage.value = "Gasto eliminado."
        }
    }

    fun clearPersonalData() {
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.clearPersonalData(_personalSpaceHash.value, monthKey)
            snackbarMessage.value = "Datos de finanzas personales limpiados."
        }
    }

    // --- Category Management ---
    fun addCategory(name: String, module: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            repository.addCategory(name.trim(), module)
            snackbarMessage.value = "Categoría agregada: $name"
        }
    }

    fun deleteCategory(name: String, module: String) {
        viewModelScope.launch {
            repository.deleteCategory(name, module)
            snackbarMessage.value = "Categoría eliminada: $name"
        }
    }

    // --- Space / Passphrase Management ---
    private fun computeSpaceHash(moduleName: String, passphrase: String): String {
        if (passphrase.isBlank()) return ""
        val cleanStr = moduleName.lowercase().trim() + "_" + passphrase.lowercase().trim()
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val digest = md.digest(cleanStr.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun setTreasurySpace(name: String, passphrase: String) {
        _treasurySpaceName.value = name.ifBlank { "Cuenta Personal" }
        _treasurySpaceHash.value = computeSpaceHash("tesoreria", passphrase)
        viewModelScope.launch {
            repository.refreshTreasury(_treasurySpaceHash.value)
            triggerFirestoreSync()
            snackbarMessage.value = "Espacio cambiado a: ${_treasurySpaceName.value}"
        }
    }

    fun setPersonalSpace(name: String, passphrase: String) {
        _personalSpaceName.value = name.ifBlank { "Cuenta Personal" }
        _personalSpaceHash.value = computeSpaceHash("personales", passphrase)
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.refreshPersonal(_personalSpaceHash.value, monthKey)
            triggerFirestoreSync()
            snackbarMessage.value = "Espacio cambiado a: ${_personalSpaceName.value}"
        }
    }

    // --- Logs ---
    fun loadLogs(module: String) {
        viewModelScope.launch {
            repository.loadLogs(module)
        }
    }

    // --- CSV Export & Import ---
    fun generateTreasuryCsv(): String {
        val sb = StringBuilder()
        sb.append("Fecha,Concepto,Tipo,Categoría,Monto\n")
        for (t in filteredTreasuryTransactions.value) {
            sb.append("\"${t.date}\",\"${t.concept}\",\"${t.type}\",\"${t.category}\",\"${t.amount}\"\n")
        }
        return sb.toString()
    }

    fun generatePersonalCsv(): String {
        val sb = StringBuilder()
        sb.append("Fecha,Concepto,Monto,Categoría,Tipo,Estado\n")
        for (e in filteredPersonalExpenses.value) {
            sb.append("\"${e.date}\",\"${e.concept}\",\"${e.amount}\",\"${e.category}\",\"${e.type}\",\"${e.status}\"\n")
        }
        return sb.toString()
    }

    fun importTreasuryCsv(csv: String) {
        viewModelScope.launch {
            repository.importTreasuryCsv(csv, _treasurySpaceHash.value)
            snackbarMessage.value = "Importación de tesorería completada."
        }
    }

    fun importPersonalCsv(csv: String) {
        val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
        viewModelScope.launch {
            repository.importPersonalExpensesCsv(csv, _personalSpaceHash.value, monthKey)
            snackbarMessage.value = "Importación de finanzas personales completada."
        }
    }

    // --- Back Navigation Hierarchy ---
    fun handleBackNavigation() {
        when (_currentScreen.value) {
            AppScreen.TREASURY_REPORT,
            AppScreen.TREASURY_EXPORT,
            AppScreen.TREASURY_IMPORT,
            AppScreen.TREASURY_CATEGORIES,
            AppScreen.TREASURY_PASSPHRASE,
            AppScreen.TREASURY_LOGS,
            AppScreen.TREASURY_ARCHIVE,
            AppScreen.TREASURY_CLEAR -> _currentScreen.value = AppScreen.TREASURY_ACTIONS_MENU

            AppScreen.TREASURY_ACTIONS_MENU -> _currentScreen.value = AppScreen.TREASURY
            AppScreen.TREASURY -> _currentScreen.value = AppScreen.MENU

            AppScreen.PERSONAL_REPORT,
            AppScreen.PERSONAL_EXPORT,
            AppScreen.PERSONAL_IMPORT,
            AppScreen.PERSONAL_CATEGORIES,
            AppScreen.PERSONAL_PASSPHRASE,
            AppScreen.PERSONAL_LOGS,
            AppScreen.PERSONAL_ARCHIVE,
            AppScreen.PERSONAL_CLEAR -> _currentScreen.value = AppScreen.PERSONAL_ACTIONS_MENU

            // Returns directly to Personal Finances module (single-click back, no actions menu intermediate)
            AppScreen.PERSONAL_COPILOT -> _currentScreen.value = AppScreen.PERSONAL_FINANCES

            AppScreen.PERSONAL_ACTIONS_MENU -> _currentScreen.value = AppScreen.PERSONAL_FINANCES
            AppScreen.PERSONAL_FINANCES -> _currentScreen.value = AppScreen.MENU

            AppScreen.MENU -> { /* Root screen */ }
            AppScreen.LOGIN -> { /* Root screen */ }
        }
    }

    fun canGoBack(): Boolean = _currentScreen.value != AppScreen.MENU && _currentScreen.value != AppScreen.LOGIN

    // --- Archive Methods ---
    fun getTreasuryYearSummary(year: Int, onResult: (count: Int, totalAmount: Double) -> Unit) {
        viewModelScope.launch {
            val list = repository.getTreasuryByYear(year, _treasurySpaceHash.value)
            val total = list.sumOf { it.amount }
            onResult(list.size, total)
        }
    }

    fun executeTreasuryArchive(year: Int, onComplete: (csv: String, count: Int) -> Unit) {
        viewModelScope.launch {
            val list = repository.getTreasuryByYear(year, _treasurySpaceHash.value)
            val sb = StringBuilder()
            sb.append("Fecha,Concepto,Tipo,Categoría,Monto\n")
            for (t in list) {
                sb.append("\"${t.date}\",\"${t.concept}\",\"${t.type}\",\"${t.category}\",\"${t.amount}\"\n")
            }
            val count = repository.archiveTreasuryYear(year, _treasurySpaceHash.value)
            onComplete(sb.toString(), count)
            snackbarMessage.value = "Año $year archivado ($count registros guardados y liberados)."
        }
    }

    fun getPersonalYearSummary(year: Int, onResult: (count: Int, totalAmount: Double) -> Unit) {
        viewModelScope.launch {
            val list = repository.getPersonalExpensesByYear(year, _personalSpaceHash.value)
            val total = list.sumOf { it.amount }
            onResult(list.size, total)
        }
    }

    fun executePersonalArchive(year: Int, onComplete: (csv: String, count: Int) -> Unit) {
        viewModelScope.launch {
            val list = repository.getPersonalExpensesByYear(year, _personalSpaceHash.value)
            val sb = StringBuilder()
            sb.append("Fecha,Concepto,Monto,Categoría,Tipo,Estado\n")
            for (e in list) {
                sb.append("\"${e.date}\",\"${e.concept}\",\"${e.amount}\",\"${e.category}\",\"${e.type}\",\"${e.status}\"\n")
            }
            val monthKey = getPersonalMonthKey(_personalFilterYear.value, _personalFilterMonth.value)
            val count = repository.archivePersonalYear(year, _personalSpaceHash.value, monthKey)
            onComplete(sb.toString(), count)
            snackbarMessage.value = "Año $year archivado ($count gastos guardados y liberados)."
        }
    }

    // --- Space Members Management ---
    private val _members = MutableStateFlow<List<SpaceMember>>(
        listOf(
            SpaceMember("Usuario Actual (Tú)", "tucorreo@gmail.com", canAdd = true, canEdit = true, canDelete = true),
            SpaceMember("Pastor / Administrador", "pastor@iglesia.org", canAdd = true, canEdit = true, canDelete = true),
            SpaceMember("Secretaría", "secretaria@iglesia.org", canAdd = true, canEdit = true, canDelete = false),
            SpaceMember("Auditor Externo", "auditor@finanzas.com", canAdd = false, canEdit = false, canDelete = false, readOnly = true)
        )
    )
    val members: StateFlow<List<SpaceMember>> = _members.asStateFlow()

    fun updateMemberPermission(index: Int, member: SpaceMember) {
        val currentList = _members.value.toMutableList()
        if (index in currentList.indices) {
            currentList[index] = member
            _members.value = currentList
            snackbarMessage.value = "Permisos actualizados para ${member.name}"
        }
    }

    // --- Finanzas Copilot AI Assistant ---
    private val _copilotMessages = MutableStateFlow<List<CopilotMessage>>(
        listOf(
            CopilotMessage(
                sender = "copilot",
                text = "¡Hola! Soy tu asistente de Finanzas Personales. Puedo analizar tu presupuesto, tus gastos fijos y variables, o darte consejos de ahorro personalizados. ¿En qué te puedo ayudar hoy?"
            )
        )
    )
    val copilotMessages: StateFlow<List<CopilotMessage>> = _copilotMessages.asStateFlow()

    fun sendCopilotMessage(userText: String) {
        val trimmed = userText.trim()
        if (trimmed.isBlank()) return

        val userMsg = CopilotMessage(sender = "user", text = trimmed)
        val currentList = _copilotMessages.value.toMutableList()
        currentList.add(userMsg)
        _copilotMessages.value = currentList

        viewModelScope.launch {
            val budget = currentBudget.value
            val paid = personalTotalPaid.value
            val pending = personalTotalPending.value
            val totalExpense = paid + pending
            val available = budget - paid
            val expensesList = filteredPersonalExpenses.value
            val fixedCount = expensesList.count { it.type == "fijo" }
            val varCount = expensesList.count { it.type == "variable" }
            val topCategory = expensesList.groupBy { it.category }
                .maxByOrNull { it.value.sumOf { exp -> exp.amount } }

            val response = when {
                trimmed.contains("presupuesto", ignoreCase = true) || trimmed.contains("saldo", ignoreCase = true) -> {
                    val pct = if (budget > 0) String.format(Locale.US, "%.1f", (paid / budget) * 100) else "0"
                    "Tu presupuesto configurado para este período es de RD$ ${String.format(Locale.US, "%,.2f", budget)}.\n" +
                            "• Has pagado: RD$ ${String.format(Locale.US, "%,.2f", paid)} ($pct%)\n" +
                            "• Tienes pendiente por pagar: RD$ ${String.format(Locale.US, "%,.2f", pending)}\n" +
                            "• Tu saldo disponible restante es: RD$ ${String.format(Locale.US, "%,.2f", available)}"
                }
                trimmed.contains("consejo", ignoreCase = true) || trimmed.contains("ahorr", ignoreCase = true) -> {
                    if (topCategory != null) {
                        val topCatTotal = topCategory.value.sumOf { it.amount }
                        "💡 Consejo de Ahorro: Tu categoría con mayor gasto registrado es **${topCategory.key}** con RD$ ${String.format(Locale.US, "%,.2f", topCatTotal)}. Considera revisar si hay suscripciones o compras no esenciales en este rubro. La regla 50/30/20 sugiere destinar máximo 50% a necesidades, 30% a deseos y 20% a ahorro."
                    } else {
                        "💡 Consejo de Ahorro: Comienza registrando todos tus gastos diarios por pequeños que sean ('gastos hormiga'). Establecer un fondo de emergencia para 3 meses de gastos fijos es tu mejor escudo financiero."
                    }
                }
                trimmed.contains("gasto", ignoreCase = true) || trimmed.contains("fijo", ignoreCase = true) || trimmed.contains("variable", ignoreCase = true) -> {
                    "Actualmente tienes $fixedCount gastos fijos y $varCount gastos variables/imprevistos registrados en este mes. Total acumulado en gastos: RD$ ${String.format(Locale.US, "%,.2f", totalExpense)}."
                }
                else -> {
                    "He revisado tus números financieros actuales:\n" +
                            "• Presupuesto: RD$ ${String.format(Locale.US, "%,.2f", budget)}\n" +
                            "• Pagado: RD$ ${String.format(Locale.US, "%,.2f", paid)}\n" +
                            "• Pendiente: RD$ ${String.format(Locale.US, "%,.2f", pending)}\n" +
                            "• Saldo Disponible: RD$ ${String.format(Locale.US, "%,.2f", available)}\n" +
                            "¿Deseas una sugerencia para recortar gastos o balancear tu presupuesto?"
                }
            }

            kotlinx.coroutines.delay(400) // Small natural response delay
            val copilotMsg = CopilotMessage(sender = "copilot", text = response)
            _copilotMessages.value = _copilotMessages.value + copilotMsg
        }
    }
}
