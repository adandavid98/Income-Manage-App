package com.example.incomemanage.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.example.incomemanage.model.ActivityLog
import com.example.incomemanage.model.PersonalExpense
import com.example.incomemanage.model.TreasuryTransaction

class AppDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        const val DATABASE_NAME = "income_manage.db"
        const val DATABASE_VERSION = 1

        const val TABLE_TREASURY = "treasury_transactions"
        const val TABLE_PERSONAL_EXPENSES = "personal_expenses"
        const val TABLE_PERSONAL_BUDGETS = "personal_budgets"
        const val TABLE_ACTIVITY_LOGS = "activity_logs"
        const val TABLE_CATEGORIES = "categories"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE $TABLE_TREASURY (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                concept TEXT NOT NULL,
                amount REAL NOT NULL,
                type TEXT NOT NULL,
                category TEXT NOT NULL,
                space_hash TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_PERSONAL_EXPENSES (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                concept TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                space_hash TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_PERSONAL_BUDGETS (
                key TEXT PRIMARY KEY,
                month_year TEXT NOT NULL,
                amount REAL NOT NULL,
                space_hash TEXT NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_ACTIVITY_LOGS (
                id TEXT PRIMARY KEY,
                module TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_CATEGORIES (
                name TEXT NOT NULL,
                module TEXT NOT NULL,
                PRIMARY KEY (name, module)
            )
        """.trimIndent())

        // Insert initial default categories
        val defaultTreasuryCategories = listOf("Diezmo", "Ofrenda", "Servicios", "Mantenimiento", "Eventos", "Construcción", "Donación", "Otros")
        for (cat in defaultTreasuryCategories) {
            db.execSQL("INSERT OR IGNORE INTO $TABLE_CATEGORIES (name, module) VALUES (?, 'tesoreria')", arrayOf(cat))
        }

        val defaultPfCategories = listOf("Vivienda", "Comida", "Transporte", "Servicios", "Salud", "Educación", "Entretenimiento", "Deudas", "Ahorro", "Otros")
        for (cat in defaultPfCategories) {
            db.execSQL("INSERT OR IGNORE INTO $TABLE_CATEGORIES (name, module) VALUES (?, 'personales')", arrayOf(cat))
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_TREASURY")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_PERSONAL_EXPENSES")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_PERSONAL_BUDGETS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_ACTIVITY_LOGS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_CATEGORIES")
        onCreate(db)
    }

    // --- Treasury Transactions ---
    fun insertOrUpdateTreasury(item: TreasuryTransaction) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("id", item.id)
            put("date", item.date)
            put("concept", item.concept)
            put("amount", item.amount)
            put("type", item.type)
            put("category", item.category)
            put("space_hash", item.spaceHash)
            put("timestamp", item.timestamp)
        }
        db.insertWithOnConflict(TABLE_TREASURY, null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun deleteTreasury(id: String) {
        writableDatabase.delete(TABLE_TREASURY, "id = ?", arrayOf(id))
    }

    fun clearTreasury(spaceHash: String) {
        writableDatabase.delete(TABLE_TREASURY, "space_hash = ?", arrayOf(spaceHash))
    }

    fun getAllTreasury(spaceHash: String): List<TreasuryTransaction> {
        val list = mutableListOf<TreasuryTransaction>()
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT id, date, concept, amount, type, category, space_hash, timestamp FROM $TABLE_TREASURY WHERE space_hash = ? ORDER BY date DESC, timestamp DESC",
            arrayOf(spaceHash)
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    TreasuryTransaction(
                        id = it.getString(0),
                        date = it.getString(1),
                        concept = it.getString(2),
                        amount = it.getDouble(3),
                        type = it.getString(4),
                        category = it.getString(5),
                        spaceHash = it.getString(6),
                        timestamp = it.getLong(7)
                    )
                )
            }
        }
        return list
    }

    fun getTreasuryByYear(year: Int, spaceHash: String): List<TreasuryTransaction> {
        val list = mutableListOf<TreasuryTransaction>()
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT id, date, concept, amount, type, category, space_hash, timestamp FROM $TABLE_TREASURY WHERE space_hash = ? AND date LIKE ? ORDER BY date ASC",
            arrayOf(spaceHash, "$year-%")
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    TreasuryTransaction(
                        id = it.getString(0),
                        date = it.getString(1),
                        concept = it.getString(2),
                        amount = it.getDouble(3),
                        type = it.getString(4),
                        category = it.getString(5),
                        spaceHash = it.getString(6),
                        timestamp = it.getLong(7)
                    )
                )
            }
        }
        return list
    }

    fun deleteTreasuryByYear(year: Int, spaceHash: String): Int {
        return writableDatabase.delete(
            TABLE_TREASURY,
            "space_hash = ? AND date LIKE ?",
            arrayOf(spaceHash, "$year-%")
        )
    }

    // --- Personal Expenses ---
    fun insertOrUpdatePersonalExpense(item: PersonalExpense) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("id", item.id)
            put("date", item.date)
            put("concept", item.concept)
            put("amount", item.amount)
            put("category", item.category)
            put("type", item.type)
            put("status", item.status)
            put("space_hash", item.spaceHash)
            put("timestamp", item.timestamp)
        }
        db.insertWithOnConflict(TABLE_PERSONAL_EXPENSES, null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun updatePersonalExpenseStatus(id: String, newStatus: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("status", newStatus)
        }
        db.update(TABLE_PERSONAL_EXPENSES, values, "id = ?", arrayOf(id))
    }

    fun deletePersonalExpense(id: String) {
        writableDatabase.delete(TABLE_PERSONAL_EXPENSES, "id = ?", arrayOf(id))
    }

    fun clearPersonalExpenses(spaceHash: String) {
        writableDatabase.delete(TABLE_PERSONAL_EXPENSES, "space_hash = ?", arrayOf(spaceHash))
    }

    fun getAllPersonalExpenses(spaceHash: String): List<PersonalExpense> {
        val list = mutableListOf<PersonalExpense>()
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT id, date, concept, amount, category, type, status, space_hash, timestamp FROM $TABLE_PERSONAL_EXPENSES WHERE space_hash = ? ORDER BY date DESC, timestamp DESC",
            arrayOf(spaceHash)
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    PersonalExpense(
                        id = it.getString(0),
                        date = it.getString(1),
                        concept = it.getString(2),
                        amount = it.getDouble(3),
                        category = it.getString(4),
                        type = it.getString(5),
                        status = it.getString(6),
                        spaceHash = it.getString(7),
                        timestamp = it.getLong(8)
                    )
                )
            }
        }
        return list
    }

    fun getPersonalExpensesByYear(year: Int, spaceHash: String): List<PersonalExpense> {
        val list = mutableListOf<PersonalExpense>()
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT id, date, concept, amount, category, type, status, space_hash, timestamp FROM $TABLE_PERSONAL_EXPENSES WHERE space_hash = ? AND date LIKE ? ORDER BY date ASC",
            arrayOf(spaceHash, "$year-%")
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    PersonalExpense(
                        id = it.getString(0),
                        date = it.getString(1),
                        concept = it.getString(2),
                        amount = it.getDouble(3),
                        category = it.getString(4),
                        type = it.getString(5),
                        status = it.getString(6),
                        spaceHash = it.getString(7),
                        timestamp = it.getLong(8)
                    )
                )
            }
        }
        return list
    }

    fun deletePersonalExpensesByYear(year: Int, spaceHash: String): Int {
        return writableDatabase.delete(
            TABLE_PERSONAL_EXPENSES,
            "space_hash = ? AND date LIKE ?",
            arrayOf(spaceHash, "$year-%")
        )
    }

    // --- Personal Budgets ---
    fun setPersonalBudget(monthYear: String, spaceHash: String, amount: Double) {
        val db = writableDatabase
        val key = "${spaceHash}_$monthYear"
        val values = ContentValues().apply {
            put("key", key)
            put("month_year", monthYear)
            put("amount", amount)
            put("space_hash", spaceHash)
        }
        db.insertWithOnConflict(TABLE_PERSONAL_BUDGETS, null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getPersonalBudget(monthYear: String, spaceHash: String): Double {
        val db = readableDatabase
        val key = "${spaceHash}_$monthYear"
        val cursor = db.rawQuery(
            "SELECT amount FROM $TABLE_PERSONAL_BUDGETS WHERE key = ?",
            arrayOf(key)
        )
        cursor.use {
            if (it.moveToFirst()) {
                return it.getDouble(0)
            }
        }
        return 0.0
    }

    // --- Activity Logs ---
    fun addLog(module: String, action: String, details: String) {
        val db = writableDatabase
        val id = java.util.UUID.randomUUID().toString()
        val values = ContentValues().apply {
            put("id", id)
            put("module", module)
            put("action", action)
            put("details", details)
            put("timestamp", System.currentTimeMillis())
        }
        db.insertWithOnConflict(TABLE_ACTIVITY_LOGS, null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getLogs(module: String): List<ActivityLog> {
        val list = mutableListOf<ActivityLog>()
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT id, module, action, details, timestamp FROM $TABLE_ACTIVITY_LOGS WHERE module = ? ORDER BY timestamp DESC LIMIT 50",
            arrayOf(module)
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    ActivityLog(
                        id = it.getString(0),
                        module = it.getString(1),
                        action = it.getString(2),
                        details = it.getString(3),
                        timestamp = it.getLong(4)
                    )
                )
            }
        }
        return list
    }

    // --- Categories ---
    fun getCategories(module: String): List<String> {
        val list = mutableListOf<String>()
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT name FROM $TABLE_CATEGORIES WHERE module = ? ORDER BY name ASC",
            arrayOf(module)
        )
        cursor.use {
            while (it.moveToNext()) {
                list.add(it.getString(0))
            }
        }
        return list
    }

    fun addCategory(name: String, module: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("name", name.trim())
            put("module", module)
        }
        db.insertWithOnConflict(TABLE_CATEGORIES, null, values, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun deleteCategory(name: String, module: String) {
        writableDatabase.delete(TABLE_CATEGORIES, "name = ? AND module = ?", arrayOf(name, module))
    }
}
