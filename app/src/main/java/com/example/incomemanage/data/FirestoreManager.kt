package com.example.incomemanage.data

import android.util.Log
import com.example.incomemanage.model.PersonalExpense
import com.example.incomemanage.model.TreasuryTransaction
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object FirestoreManager {

    private const val TAG = "FirestoreManager"

    private val firestore: FirebaseFirestore
        get() = FirebaseFirestore.getInstance()

    private var treasuryRegistration: ListenerRegistration? = null
    private var personalRegistration: ListenerRegistration? = null
    private var rootDocRegistration: ListenerRegistration? = null

    private fun getEffectiveUid(userId: String): String {
        return userId.ifBlank {
            FirebaseAuth.getInstance().currentUser?.uid ?: "user_default"
        }
    }

    private fun getIsoTimestamp(timestamp: Long = System.currentTimeMillis()): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(timestamp))
    }

    // Get root doc reference (either shared space or individual user)
    private fun getRootDocRef(effectiveUid: String, spaceHash: String, isTreasury: Boolean): DocumentReference {
        return if (spaceHash.isNotBlank()) {
            val collectionName = if (isTreasury) "shared_tesoreria" else "shared_personales"
            firestore.collection(collectionName).document(spaceHash)
        } else {
            firestore.collection("users").document(effectiveUid)
        }
    }

    // --- TREASURY SYNC ---

    fun listenTreasury(
        userId: String,
        spaceHash: String,
        onTransactionsUpdated: (List<TreasuryTransaction>) -> Unit,
        onCategoriesUpdated: (List<String>) -> Unit = {}
    ) {
        val uid = getEffectiveUid(userId)
        treasuryRegistration?.remove()
        rootDocRegistration?.remove()

        val isShared = spaceHash.isNotBlank()
        val rootDoc = getRootDocRef(uid, spaceHash, true)
        val transCol = if (isShared) {
            firestore.collection("shared_tesoreria").document(spaceHash).collection("transacciones")
        } else {
            firestore.collection("users").document(uid).collection("transacciones")
        }

        // 1. Listen to root doc for metadata & legacy transactions
        rootDocRegistration = rootDoc.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.w(TAG, "Error listening to treasury root doc: ${error.message}")
                return@addSnapshotListener
            }
            if (snapshot != null && snapshot.exists()) {
                val data = snapshot.data ?: return@addSnapshotListener
                
                // Categories
                val cats = data["treasuryCategories"] as? List<*>
                if (cats != null) {
                    val catNames = cats.mapNotNull {
                        when (it) {
                            is String -> it
                            is Map<*, *> -> it["name"]?.toString()
                            else -> null
                        }
                    }
                    if (catNames.isNotEmpty()) onCategoriesUpdated(catNames)
                }

                // Check for legacy array data if subcollection might be empty
                val legacyTransactions = data["transactions"] as? List<*>
                if (!legacyTransactions.isNullOrEmpty()) {
                    val parsed = mutableListOf<TreasuryTransaction>()
                    for (item in legacyTransactions) {
                        if (item is Map<*, *>) {
                            val id = item["id"]?.toString() ?: ""
                            val date = item["fecha"]?.toString() ?: item["date"]?.toString() ?: ""
                            val concept = item["concepto"]?.toString() ?: item["concept"]?.toString() ?: ""
                            val amount = (item["monto"] as? Number)?.toDouble() ?: (item["amount"] as? Number)?.toDouble() ?: 0.0
                            val type = item["tipo"]?.toString() ?: item["type"]?.toString() ?: "gasto"
                            val category = item["categoria"]?.toString() ?: item["category"]?.toString() ?: "General"
                            if (id.isNotBlank() && concept.isNotBlank()) {
                                parsed.add(
                                    TreasuryTransaction(
                                        id = id,
                                        date = date,
                                        concept = concept,
                                        amount = amount,
                                        type = if (type.lowercase().contains("ingreso")) "ingreso" else "gasto",
                                        category = category,
                                        spaceHash = spaceHash
                                    )
                                )
                            }
                        }
                    }
                    if (parsed.isNotEmpty()) {
                        onTransactionsUpdated(parsed.sortedByDescending { it.date })
                    }
                }
            }
        }

        // 2. Listen to transacciones subcollection (standard scalable Firestore structure)
        treasuryRegistration = transCol.addSnapshotListener { snapshots, error ->
            if (error != null) {
                Log.w(TAG, "Error listening to transacciones: ${error.message}")
                return@addSnapshotListener
            }
            if (snapshots != null) {
                val list = mutableListOf<TreasuryTransaction>()
                for (doc in snapshots.documents) {
                    val id = doc.id
                    val date = doc.getString("fecha") ?: doc.getString("date") ?: ""
                    val concept = doc.getString("concepto") ?: doc.getString("concept") ?: ""
                    val amount = doc.getDouble("monto") ?: doc.getDouble("amount") 
                        ?: (doc.get("monto") as? Number)?.toDouble() 
                        ?: (doc.get("amount") as? Number)?.toDouble() ?: 0.0
                    val type = doc.getString("tipo") ?: doc.getString("type") ?: "gasto"
                    val category = doc.getString("categoria") ?: doc.getString("category") ?: "General"

                    list.add(
                        TreasuryTransaction(
                            id = id,
                            date = date,
                            concept = concept,
                            amount = amount,
                            type = if (type.lowercase().contains("ingreso")) "ingreso" else "gasto",
                            category = category,
                            spaceHash = spaceHash
                        )
                    )
                }
                list.sortByDescending { it.date }
                onTransactionsUpdated(list)
            }
        }
    }

    suspend fun saveTreasuryTransaction(userId: String, spaceHash: String, item: TreasuryTransaction) {
        try {
            val uid = getEffectiveUid(userId)
            val isShared = spaceHash.isNotBlank()
            val transCol = if (isShared) {
                firestore.collection("shared_tesoreria").document(spaceHash).collection("transacciones")
            } else {
                firestore.collection("users").document(uid).collection("transacciones")
            }

            val data = hashMapOf(
                "id" to item.id,
                "fecha" to item.date,
                "concepto" to item.concept,
                "monto" to item.amount,
                "tipo" to item.type,
                "categoria" to item.category,
                "createdAt" to getIsoTimestamp(item.timestamp),
                "updatedAt" to getIsoTimestamp()
            )

            transCol.document(item.id).set(data, SetOptions.merge()).await()
            Log.d(TAG, "Successfully synced treasury transaction: ${item.id}")
        } catch (e: Exception) {
            Log.e(TAG, "Error saving treasury transaction to Firestore: ${e.message}", e)
        }
    }

    suspend fun deleteTreasuryTransaction(userId: String, spaceHash: String, itemId: String) {
        try {
            val uid = getEffectiveUid(userId)
            val isShared = spaceHash.isNotBlank()
            val transCol = if (isShared) {
                firestore.collection("shared_tesoreria").document(spaceHash).collection("transacciones")
            } else {
                firestore.collection("users").document(uid).collection("transacciones")
            }
            transCol.document(itemId).delete().await()
            Log.d(TAG, "Successfully deleted treasury transaction from Firestore: $itemId")
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting treasury transaction from Firestore: ${e.message}", e)
        }
    }

    // --- PERSONAL FINANCES SYNC ---

    fun listenPersonalFinances(
        userId: String,
        spaceHash: String,
        onExpensesUpdated: (List<PersonalExpense>) -> Unit,
        onBudgetUpdated: (Map<String, Double>) -> Unit,
        onCategoriesUpdated: (List<String>) -> Unit = {}
    ) {
        val uid = getEffectiveUid(userId)
        personalRegistration?.remove()

        val isShared = spaceHash.isNotBlank()
        val rootDoc = getRootDocRef(uid, spaceHash, false)
        val expCol = if (isShared) {
            firestore.collection("shared_personales").document(spaceHash).collection("gastos_personales")
        } else {
            firestore.collection("users").document(uid).collection("gastos_personales")
        }

        // 1. Listen to root doc for metadata & monthly budget map (personalIncomes)
        rootDoc.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.w(TAG, "Error listening to personal root doc: ${error.message}")
                return@addSnapshotListener
            }
            if (snapshot != null && snapshot.exists()) {
                val data = snapshot.data ?: return@addSnapshotListener

                // Categories
                val cats = data["personalCategories"] as? List<*>
                if (cats != null) {
                    val catNames = cats.mapNotNull {
                        when (it) {
                            is String -> it
                            is Map<*, *> -> it["name"]?.toString()
                            else -> null
                        }
                    }
                    if (catNames.isNotEmpty()) onCategoriesUpdated(catNames)
                }

                // Parse personalIncomes map (e.g. {"2026-09": 45000.0})
                val rawIncomes = data["personalIncomes"] as? Map<*, *>
                if (rawIncomes != null) {
                    val budgetMap = mutableMapOf<String, Double>()
                    for ((k, v) in rawIncomes) {
                        val keyStr = k.toString()
                        val amt = (v as? Number)?.toDouble() ?: v.toString().toDoubleOrNull() ?: 0.0
                        if (amt > 0) budgetMap[keyStr] = amt
                    }
                    onBudgetUpdated(budgetMap)
                }

                // Check for legacy array data if subcollection is empty
                val legacyExpenses = data["personalExpenses"] as? List<*>
                if (!legacyExpenses.isNullOrEmpty()) {
                    val parsed = mutableListOf<PersonalExpense>()
                    for (item in legacyExpenses) {
                        if (item is Map<*, *>) {
                            val id = item["id"]?.toString() ?: ""
                            val date = item["fecha"]?.toString() ?: item["date"]?.toString() ?: ""
                            val concept = item["concepto"]?.toString() ?: item["concept"]?.toString() ?: ""
                            val amount = (item["monto"] as? Number)?.toDouble() ?: 0.0
                            val category = item["categoria"]?.toString() ?: "General"
                            val type = item["tipo"]?.toString() ?: "fijo"
                            val status = item["estado"]?.toString() ?: item["status"]?.toString() ?: "pagado"

                            if (id.isNotBlank() && concept.isNotBlank()) {
                                parsed.add(
                                    PersonalExpense(
                                        id = id,
                                        date = date,
                                        concept = concept,
                                        amount = amount,
                                        category = category,
                                        type = if (type.contains("var")) "variable" else "fijo",
                                        status = if (status.contains("pagad")) "pagado" else "pagar",
                                        spaceHash = spaceHash
                                    )
                                )
                            }
                        }
                    }
                    if (parsed.isNotEmpty()) {
                        onExpensesUpdated(parsed.sortedByDescending { it.date })
                    }
                }
            }
        }

        // 2. Listen to gastos_personales subcollection
        personalRegistration = expCol.addSnapshotListener { snapshots, error ->
            if (error != null) {
                Log.w(TAG, "Error listening to gastos_personales: ${error.message}")
                return@addSnapshotListener
            }
            if (snapshots != null) {
                val list = mutableListOf<PersonalExpense>()
                for (doc in snapshots.documents) {
                    val id = doc.id
                    val date = doc.getString("fecha") ?: doc.getString("date") ?: ""
                    val concept = doc.getString("concepto") ?: doc.getString("concept") ?: ""
                    val amount = doc.getDouble("monto") ?: doc.getDouble("amount") 
                        ?: (doc.get("monto") as? Number)?.toDouble() ?: 0.0
                    val category = doc.getString("categoria") ?: doc.getString("category") ?: "General"
                    val type = doc.getString("tipo") ?: doc.getString("type") ?: "fijo"
                    val status = doc.getString("estado") ?: doc.getString("status") ?: "pagado"

                    list.add(
                        PersonalExpense(
                            id = id,
                            date = date,
                            concept = concept,
                            amount = amount,
                            category = category,
                            type = if (type.lowercase().contains("var")) "variable" else "fijo",
                            status = if (status.lowercase().contains("pagad")) "pagado" else "pagar",
                            spaceHash = spaceHash
                        )
                    )
                }
                list.sortByDescending { it.date }
                onExpensesUpdated(list)
            }
        }
    }

    suspend fun savePersonalExpense(userId: String, spaceHash: String, item: PersonalExpense) {
        try {
            val uid = getEffectiveUid(userId)
            val isShared = spaceHash.isNotBlank()
            val expCol = if (isShared) {
                firestore.collection("shared_personales").document(spaceHash).collection("gastos_personales")
            } else {
                firestore.collection("users").document(uid).collection("gastos_personales")
            }

            val data = hashMapOf(
                "id" to item.id,
                "fecha" to item.date,
                "concepto" to item.concept,
                "monto" to item.amount,
                "categoria" to item.category,
                "tipo" to item.type,
                "estado" to if (item.status == "pagado") "pagado" else "pendiente",
                "createdAt" to getIsoTimestamp(item.timestamp),
                "updatedAt" to getIsoTimestamp()
            )

            expCol.document(item.id).set(data, SetOptions.merge()).await()
            Log.d(TAG, "Successfully synced personal expense: ${item.id}")
        } catch (e: Exception) {
            Log.e(TAG, "Error saving personal expense to Firestore: ${e.message}", e)
        }
    }

    suspend fun updatePersonalExpenseStatus(userId: String, spaceHash: String, itemId: String, newStatus: String) {
        try {
            val uid = getEffectiveUid(userId)
            val isShared = spaceHash.isNotBlank()
            val expCol = if (isShared) {
                firestore.collection("shared_personales").document(spaceHash).collection("gastos_personales")
            } else {
                firestore.collection("users").document(uid).collection("gastos_personales")
            }
            val firestoreStatus = if (newStatus == "pagado") "pagado" else "pendiente"
            expCol.document(itemId).update(
                mapOf(
                    "estado" to firestoreStatus,
                    "updatedAt" to getIsoTimestamp()
                )
            ).await()
            Log.d(TAG, "Successfully updated personal expense status: $itemId to $firestoreStatus")
        } catch (e: Exception) {
            Log.e(TAG, "Error updating personal expense status in Firestore: ${e.message}", e)
        }
    }

    suspend fun deletePersonalExpense(userId: String, spaceHash: String, itemId: String) {
        try {
            val uid = getEffectiveUid(userId)
            val isShared = spaceHash.isNotBlank()
            val expCol = if (isShared) {
                firestore.collection("shared_personales").document(spaceHash).collection("gastos_personales")
            } else {
                firestore.collection("users").document(uid).collection("gastos_personales")
            }
            expCol.document(itemId).delete().await()
            Log.d(TAG, "Successfully deleted personal expense from Firestore: $itemId")
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting personal expense from Firestore: ${e.message}", e)
        }
    }

    suspend fun savePersonalBudget(userId: String, spaceHash: String, monthYear: String, amount: Double) {
        try {
            val uid = getEffectiveUid(userId)
            val rootDoc = getRootDocRef(uid, spaceHash, false)
            val update = hashMapOf<String, Any>(
                "personalIncomes.$monthYear" to amount,
                "updatedAt" to getIsoTimestamp()
            )
            rootDoc.update(update).await()
            Log.d(TAG, "Successfully updated budget for $monthYear: $amount")
        } catch (e: Exception) {
            try {
                val uid = getEffectiveUid(userId)
                val rootDoc = getRootDocRef(uid, spaceHash, false)
                val update = hashMapOf<String, Any>(
                    "personalIncomes" to hashMapOf(monthYear to amount),
                    "updatedAt" to getIsoTimestamp()
                )
                rootDoc.set(update, SetOptions.merge()).await()
            } catch (e2: Exception) {
                Log.e(TAG, "Error saving budget in Firestore: ${e2.message}", e2)
            }
        }
    }

    fun stopListeners() {
        treasuryRegistration?.remove()
        personalRegistration?.remove()
        rootDocRegistration?.remove()
        treasuryRegistration = null
        personalRegistration = null
        rootDocRegistration = null
    }
}
