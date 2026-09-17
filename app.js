import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    writeBatch, 
    deleteField, 
    onSnapshot, 
    enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Habilitar persistencia offline en Firestore
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('La persistencia offline de Firestore fallo: Multiples pestanas abiertas.');
    } else if (err.code == 'unimplemented') {
        console.warn('Este navegador o entorno movil no soporta persistencia offline de Firestore.');
    }
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Capturar resultado de inicio de sesion por redireccion (necesario cuando se usa signInWithRedirect)
getRedirectResult(auth).then((result) => {
    if (result && result.user) {
        console.log("Sesion iniciada por redireccion exitosa:", result.user.email);
    }
}).catch((error) => {
    console.error("Error en getRedirectResult:", error.code, error.message);
    // Mostrar error visible en la pantalla de login
    const errBox = document.getElementById('login-error-box');
    if (errBox) {
        errBox.textContent = 'Error de autenticación: ' + (error.code || error.message);
        errBox.style.display = 'block';
    }
    if (error.code === 'auth/unauthorized-domain') {
        alert('Dominio no autorizado: ' + window.location.hostname + '.\nAgrega este dominio exacto en Firebase Console > Authentication > Settings > Authorized domains.');
    }
});

// --- ESTADO DE LA APLICACIoN ---
const DEFAULT_GEMINI_KEY = "";
let copilotMessages = [];
const LANG_NAMES = {
    es: 'Espanol', en: 'English', fr: 'Francais',
    pt: 'Portuguas', it: 'Italiano', de: 'Deutsch'
};
let transactions = [];
let currentUser = null;
let selectedTransactionIdToDelete = null;
let parsedCsvTransactionsToImport = [];
let editingTransactionId = null;
let userEditedCategory = false;
let userEditedPfCategory = false;
let personalExpenses = [];
let personalIncomes = {};
let currentModule = 'menu';
let parsedPfExpensesToImport = [];
let parsedPfIncomesToImport = {};
let editingPfExpenseId = null;

// --- ESTADO DE ESPACIOS Y PASSPHRASES ---
let activeTreasurySpace = {
    passphrase: '',
    hash: '',
    spaceName: 'Cuenta Personal',
    isOwner: true,
    permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
    isBlocked: false,
    members: {},
    logs: []
};

let activePersonalSpace = {
    passphrase: '',
    hash: '',
    spaceName: 'Cuenta Personal',
    isOwner: true,
    permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
    isBlocked: false,
    members: {},
    logs: []
};

let userSavedWorkspaces = {
    tesoreria: [],
    personales: []
};

let treasuryUnsubscribe = null;
let personalUnsubscribe = null;
let treasurySubcolUnsubscribe = null;
let personalSubcolUnsubscribe = null;

let currentPassphraseModalModule = 'tesoreria';
let currentManagePassphraseModule = 'tesoreria';
let currentLogsModalModule = 'tesoreria';

// Helper para limpiar valores undefined antes de guardar en Firestore
function sanitizeData(data) {
    if (data === undefined) return null;
    return JSON.parse(JSON.stringify(data, (key, value) => value === undefined ? null : value));
}

// Helpers para obtener referencias de subcolecciones activas
function getTreasuryCollectionRef() {
    if (!currentUser || !db) return null;
    if (activeTreasurySpace.hash) {
        return collection(db, 'shared_tesoreria', activeTreasurySpace.hash, 'transacciones');
    }
    return collection(db, 'users', currentUser.uid, 'transacciones');
}

function getPersonalCollectionRef() {
    if (!currentUser || !db) return null;
    if (activePersonalSpace.hash) {
        return collection(db, 'shared_personales', activePersonalSpace.hash, 'gastos_personales');
    }
    return collection(db, 'users', currentUser.uid, 'gastos_personales');
}

// Auto-Migración de datos de Arrays antiguos a Subcolecciones independientes
async function migrateLegacyTreasuryData(docData, rootDocRef) {
    if (docData && Array.isArray(docData.transactions) && docData.transactions.length > 0) {
        try {
            console.log("Iniciando auto-migración de transacciones de tesorería a subcolección...");
            const transColRef = collection(rootDocRef, 'transacciones');
            const legacyList = docData.transactions;
            for (let i = 0; i < legacyList.length; i += 400) {
                const batch = writeBatch(db);
                const chunk = legacyList.slice(i, i + 400);
                chunk.forEach(t => {
                    const tId = t.id || ('t-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
                    t.id = tId;
                    const docItemRef = doc(transColRef, tId);
                    batch.set(docItemRef, sanitizeData(t), { merge: true });
                });
                await batch.commit();
            }
            await updateDoc(rootDocRef, {
                transactions: deleteField()
            });
            console.log("Auto-migración de tesorería completada exitosamente.");
        } catch (mErr) {
            console.error("Error durante auto-migración de tesorería:", mErr);
        }
    }
}

async function migrateLegacyPersonalData(docData, rootDocRef) {
    if (docData && Array.isArray(docData.personalExpenses) && docData.personalExpenses.length > 0) {
        try {
            console.log("Iniciando auto-migración de gastos personales a subcolección...");
            const expColRef = collection(rootDocRef, 'gastos_personales');
            const legacyList = docData.personalExpenses;
            for (let i = 0; i < legacyList.length; i += 400) {
                const batch = writeBatch(db);
                const chunk = legacyList.slice(i, i + 400);
                chunk.forEach(e => {
                    const eId = e.id || ('pf-' + Date.now() + Math.random().toString(36).substr(2, 5));
                    e.id = eId;
                    const docItemRef = doc(expColRef, eId);
                    batch.set(docItemRef, sanitizeData(e), { merge: true });
                });
                await batch.commit();
            }
            await updateDoc(rootDocRef, {
                personalExpenses: deleteField()
            });
            console.log("Auto-migración de finanzas personales completada exitosamente.");
        } catch (mErr) {
            console.error("Error durante auto-migración de finanzas personales:", mErr);
        }
    }
}

// Generador de Hash para Passphrases
async function hashPassphrase(moduleName, passphrase) {
    if (!passphrase || !passphrase.trim()) return '';
    const cleanStr = moduleName.toLowerCase().trim() + '_' + passphrase.toLowerCase().trim();
    const msgUint8 = new TextEncoder().encode(cleanStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Registrar Eventos en el Log de Auditoria (Optimizado a los últimos 50 eventos)
async function addAuditLog(moduleName, action, details) {
    const timestamp = new Date().toLocaleString();
    const userEmail = currentUser ? currentUser.email : 'Usuario Local';
    const logItem = {
        id: Date.now().toString(),
        timestamp,
        userEmail,
        action,
        details
    };

    if (moduleName === 'tesoreria') {
        activeTreasurySpace.logs = activeTreasurySpace.logs || [];
        activeTreasurySpace.logs.unshift(logItem);
        if (activeTreasurySpace.logs.length > 50) {
            activeTreasurySpace.logs = activeTreasurySpace.logs.slice(0, 50);
        }
        await saveTransactionsMetadata();
    } else {
        activePersonalSpace.logs = activePersonalSpace.logs || [];
        activePersonalSpace.logs.unshift(logItem);
        if (activePersonalSpace.logs.length > 50) {
            activePersonalSpace.logs = activePersonalSpace.logs.slice(0, 50);
        }
        await savePersonalFinancesMetadata();
    }
}


// Actualizar Insignia del Espacio Activo
function updateSpaceBadgeUI(moduleName) {
    const isTreasury = moduleName === 'tesoreria';
    const badge = document.getElementById(isTreasury ? 't-space-badge' : 'pf-space-badge');
    const nameEl = document.getElementById(isTreasury ? 't-space-name' : 'pf-space-name');
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;

    if (badge && nameEl) {
        const iconEl = badge.querySelector('.space-icon');
        if (activeSpace.hash) {
            badge.className = 'space-badge space-shared';
            if (iconEl) {
                iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
            }
            const isStrictlyReadOnly = !activeSpace.isOwner && activeSpace.permissions && activeSpace.permissions.isReadOnly && !activeSpace.permissions.allowAdd;
            const readOnlyLabel = isStrictlyReadOnly ? ' (Solo Ver)' : '';
            nameEl.textContent = (activeSpace.spaceName || 'Espacio Compartido') + readOnlyLabel;
        } else {
            badge.className = 'space-badge';
            if (iconEl) {
                iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            }
            nameEl.textContent = activeSpace.spaceName || 'Cuenta Personal';
        }
    }
}

// Actualizar Visibilidad de Botones por Permisos
function updateModulePermissionUI(moduleName) {
    if (moduleName === 'tesoreria') {
        const btnConfig = document.getElementById('btn-config-passphrase');
        const btnImport = document.getElementById('btn-import-trigger');
        const btnClear = document.getElementById('btn-clear-data');
        const btnArchive = document.getElementById('btn-t-archive-year');
        const submitBtn = document.querySelector('#transaction-form button[type="submit"]');
        const isOwner = activeTreasurySpace.isOwner || !activeTreasurySpace.hash;
        const allowAdd = isOwner || (activeTreasurySpace.permissions.allowAdd !== false && !activeTreasurySpace.permissions.isReadOnly);

        if (btnConfig) btnConfig.style.display = isOwner ? 'inline-flex' : 'none';
        if (btnImport) btnImport.style.display = isOwner ? 'inline-flex' : 'none';
        if (btnClear) btnClear.style.display = isOwner ? 'inline-flex' : 'none';
        if (btnArchive) btnArchive.style.display = isOwner ? 'inline-flex' : 'none';

        if (submitBtn) {
            submitBtn.disabled = !allowAdd;
            submitBtn.title = allowAdd ? '' : 'Modo Solo Lectura: No tienes permiso para agregar transacciones';
            submitBtn.style.opacity = allowAdd ? '1' : '0.5';
            submitBtn.style.cursor = allowAdd ? 'pointer' : 'not-allowed';
        }
    } else {
        const btnConfig = document.getElementById('btn-pf-config-passphrase');
        const btnImport = document.getElementById('btn-pf-import-trigger');
        const btnClear = document.getElementById('btn-pf-clear-data');
        const btnPfArchive = document.getElementById('btn-pf-archive-year');
        const submitBtn = document.querySelector('#pf-expense-form button[type="submit"]');
        const isOwner = activePersonalSpace.isOwner || !activePersonalSpace.hash;
        const allowAdd = isOwner || (activePersonalSpace.permissions.allowAdd !== false && !activePersonalSpace.permissions.isReadOnly);

        if (btnConfig) btnConfig.style.display = isOwner ? 'inline-flex' : 'none';
        if (btnImport) btnImport.style.display = isOwner ? 'inline-flex' : 'none';
        if (btnClear) btnClear.style.display = isOwner ? 'inline-flex' : 'none';
        if (btnPfArchive) btnPfArchive.style.display = isOwner ? 'inline-flex' : 'none';

        if (submitBtn) {
            submitBtn.disabled = !allowAdd;
            submitBtn.title = allowAdd ? '' : 'Modo Solo Lectura: No tienes permiso para registrar gastos';
            submitBtn.style.opacity = allowAdd ? '1' : '0.5';
            submitBtn.style.cursor = allowAdd ? 'pointer' : 'not-allowed';
        }
    }
}


// Guardar Espacios Guardados en el Perfil de Google
async function saveSavedWorkspacesToUser() {
    if (!currentUser || !db) return;
    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await setDoc(userDocRef, {
            savedWorkspaces: userSavedWorkspaces
        }, { merge: true });
    } catch (e) {
        console.error('Error guardando espacios en perfil de usuario', e);
    }
}

const DEFAULT_TREASURY_CATEGORIES = [
    { name: "Ofrenda", color: "#10b981" },
    { name: "Diezmo", color: "#059669" },
    { name: "Donacion", color: "#0d9488" },
    { name: "Construccion", color: "#d97706" },
    { name: "Sonido / Multimedia", color: "#4f46e5" },
    { name: "Evangelismo", color: "#7c3aed" },
    { name: "Servicios (Agua/Luz)", color: "#dc2626" },
    { name: "Otros", color: "#6b7280" }
];

const DEFAULT_PERSONAL_CATEGORIES = [
    { name: "Alquiler / Hipoteca", color: "#78350f" },
    { name: "Electricidad / Agua", color: "#eab308" },
    { name: "Gasolina / Transporte", color: "#0284c7" },
    { name: "Supermercado / Comida", color: "#059669" },
    { name: "Salidas / Entretenimiento", color: "#db2777" },
    { name: "Suscripciones", color: "#dc2626" },
    { name: "Salud / Medicinas", color: "#0d9488" },
    { name: "Otros", color: "#6b7280" }
];

let treasuryCategories = [...DEFAULT_TREASURY_CATEGORIES];
let personalCategories = [...DEFAULT_PERSONAL_CATEGORIES];
let currentCategoryModule = 'tesoreria';
let pfDonutChartInstance = null;
let pfBarChartInstance = null;
let tDonutChartInstance = null;
let tBarChartInstance = null;

const DEFAULT_CONCEPT_CATEGORIES = [
    { concepto: "Ofrenda de jovenes", categoria: "Ofrenda" },
    { concepto: "Ofrenda dominical", categoria: "Ofrenda" },
    { concepto: "Ofrenda especial", categoria: "Ofrenda" },
    { concepto: "Donacion", categoria: "Donaciones" },
    { concepto: "Diezmo", categoria: "Diezmos" },
    { concepto: "Compra de microfonos", categoria: "Equipo de sonido" },
    { concepto: "Compra de cables", categoria: "Equipo de sonido" },
    { concepto: "Alquiler de local", categoria: "Alquiler" },
    { concepto: "Refrigerio para reunion", categoria: "Refrigerios" },
    { concepto: "Pizza reunion", categoria: "Refrigerios" },
    { concepto: "Refrescos y vasos", categoria: "Refrigerios" },
    { concepto: "Impresion de folletos", categoria: "Papeleria" },
    { concepto: "Fotocopias e impresiones", categoria: "Papeleria" },
    { concepto: "Gasolina transporte", categoria: "Transporte" },
    { concepto: "Alquiler de autobus", categoria: "Transporte" },
    { concepto: "Inscripcion campamento", categoria: "Campamento" },
    { concepto: "Materiales de escuela dominical", categoria: "Escuela dominical" },
    { concepto: "Articulos de limpieza", categoria: "Mantenimiento" }
];

const KEYWORD_CATEGORY_RULES = [
    { keywords: ["ofrenda", "donacion", "diezmo", "donar", "contribucion"], categoria: "Ofrenda" },
    { keywords: ["microfono", "cable", "sonido", "audio", "bocina", "consola", "parlante", "audifono", "parlantes"], categoria: "Equipo de sonido" },
    { keywords: ["alquiler", "renta", "local", "salon", "sillas", "mesa", "mesas"], categoria: "Alquiler" },
    { keywords: ["refrigerio", "pizza", "refresco", "comida", "vasos", "platos", "cena", "almuerzo", "pan", "pastel", "gaseosa"], categoria: "Refrigerios" },
    { keywords: ["impresion", "fotocopia", "folleto", "papel", "cuaderno", "lapicero", "tinta", "lapiz", "hoja", "hojas"], categoria: "Papeleria" },
    { keywords: ["gasolina", "transporte", "autobus", "pasaje", "viaje", "taxi", "combustible", "flete", "peaje"], categoria: "Transporte" },
    { keywords: ["campamento", "retiro", "inscripcion", "evento", "conferencia"], categoria: "Campamento" },
    { keywords: ["ninos", "escuela dominical", "didactico", "juguetes", "clase", "materiales"], categoria: "Escuela dominical" },
    { keywords: ["limpieza", "mantenimiento", "escoba", "jabon", "reparacion", "pintura", "desinfectante", "cloro"], categoria: "Mantenimiento" }
];

const DEFAULT_PF_CONCEPT_CATEGORIES = [
    { concepto: "Pago de Alquiler", categoria: "Alquiler / Hipoteca" },
    { concepto: "Pago de Renta", categoria: "Alquiler / Hipoteca" },
    { concepto: "Pago de Hipoteca", categoria: "Alquiler / Hipoteca" },
    { concepto: "Factura de Electricidad (Luz)", categoria: "Electricidad / Agua" },
    { concepto: "Factura de Agua", categoria: "Electricidad / Agua" },
    { concepto: "Factura de Basura", categoria: "Electricidad / Agua" },
    { concepto: "Compra de Gasolina", categoria: "Gasolina / Transporte" },
    { concepto: "Pasaje de Autobus / Metro", categoria: "Gasolina / Transporte" },
    { concepto: "Pago de Uber / Taxi", categoria: "Gasolina / Transporte" },
    { concepto: "Compra en Supermercado", categoria: "Supermercado / Comida" },
    { concepto: "Cena Familiar / Salida a Comer", categoria: "Supermercado / Comida" },
    { concepto: "Almuerzo Diario", categoria: "Supermercado / Comida" },
    { concepto: "Salida al Cine", categoria: "Salidas / Entretenimiento" },
    { concepto: "Salida con amigos", categoria: "Salidas / Entretenimiento" },
    { concepto: "Suscripcion de Netflix", categoria: "Suscripciones" },
    { concepto: "Suscripcion de Spotify", categoria: "Suscripciones" },
    { concepto: "Suscripcion de Youtube Premium", categoria: "Suscripciones" },
    { concepto: "Consulta Medica", categoria: "Salud / Medicinas" },
    { concepto: "Compra de Medicinas en Farmacia", categoria: "Salud / Medicinas" }
];

const KEYWORD_PF_CATEGORY_RULES = [
    { keywords: ["alquiler", "renta", "hipoteca", "apartamento", "casa", "residencia"], categoria: "Alquiler / Hipoteca" },
    { keywords: ["luz", "electricidad", "agua", "basura", "internet", "wifi", "cable", "telefono", "claro", "altice"], categoria: "Electricidad / Agua" },
    { keywords: ["gasolina", "combustible", "gasoil", "uber", "pasaje", "carro", "peaje", "metro", "pasajes", "transporte"], categoria: "Gasolina / Transporte" },
    { keywords: ["supermercado", "comida", "cena", "almuerzo", "desayuno", "pizza", "restaurante", "mcdonalds", "compra", "platanos", "compras", "comestibles"], categoria: "Supermercado / Comida" },
    { keywords: ["cine", "salida", "bar", "fiesta", "concierto", "playa", "hotel", "viaje", "bebida", "entretenimiento", "diversion"], categoria: "Salidas / Entretenimiento" },
    { keywords: ["netflix", "spotify", "youtube", "disney", "prime", "apple", "suscripcion", "suscripciones", "patreon"], categoria: "Suscripciones" },
    { keywords: ["medico", "medicina", "farmacia", "consulta", "clinica", "salud", "pastillas", "seguro", "medicinas", "dientes", "odontologia"], categoria: "Salud / Medicinas" }
];

// --- ELEMENTOS DEL DOM ---
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// Elementos de Auth
const loginSection = document.getElementById('login-section');
const dashboardContainer = document.getElementById('dashboard-container');
const menuSection = document.getElementById('menu-section');
const personalFinancesContainer = document.getElementById('personal-finances-container');
const btnGotoTesoreria = document.getElementById('btn-goto-tesoreria');
const btnGotoPersonales = document.getElementById('btn-goto-personales');
const btnBackToMenu = document.getElementById('btn-back-to-menu');
const headerLogo = document.getElementById('header-logo');

// Elementos de Finanzas Personales
const pfMonthlyIncome = document.getElementById('pf-monthly-income');
const pfTotalPaid = document.getElementById('pf-total-paid');
const pfTotalPending = document.getElementById('pf-total-pending');
const pfTotalBalance = document.getElementById('pf-total-balance');
const pfExpenseForm = document.getElementById('pf-expense-form');
const pfConcept = document.getElementById('pf-concept');
const pfAmount = document.getElementById('pf-amount');
const pfType = document.getElementById('pf-type');
const pfStatus = document.getElementById('pf-status');
const pfFixedCount = document.getElementById('pf-fixed-count');
const pfVariableCount = document.getElementById('pf-variable-count');
const pfFixedList = document.getElementById('pf-fixed-list');
const pfVariableList = document.getElementById('pf-variable-list');
const btnPfReport = document.getElementById('btn-pf-report');
const btnPfExport = document.getElementById('btn-pf-export');
const btnPfImportTrigger = document.getElementById('btn-pf-import-trigger');
const pfCsvFileInput = document.getElementById('pf-csv-file-input');
const btnPfClearData = document.getElementById('btn-pf-clear-data');
const pfDate = document.getElementById('pf-date');
const pfSubmitText = document.getElementById('pf-submit-text');
const pfSubmitIconWrapper = document.getElementById('pf-submit-icon-wrapper');
const btnPfCancelEdit = document.getElementById('btn-pf-cancel-edit');
const pfFilterMonth = document.getElementById('pf-filter-month');
const pfFilterYear = document.getElementById('pf-filter-year');
const pfCategory = document.getElementById('pf-category');
const pfAutocompleteList = document.getElementById('pf-autocomplete-list');

// Elementos de Configuracion de Categorias
const btnTManageCategories = document.getElementById('btn-t-manage-categories');
const btnPfManageCategories = document.getElementById('btn-pf-manage-categories');
const modalManageCategories = document.getElementById('modal-manage-categories');
const mcModalTitle = document.getElementById('mc-modal-title');
const mcCategoryList = document.getElementById('mc-category-list');
const mcCategoryForm = document.getElementById('mc-category-form');
const mcCategoryName = document.getElementById('mc-category-name');
const mcCategoryIndex = document.getElementById('mc-category-index');
const mcSelectedColor = document.getElementById('mc-selected-color');
const btnMcSubmit = document.getElementById('btn-mc-submit');
const btnMcClose = document.getElementById('btn-mc-close');

const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLogout = document.getElementById('btn-logout');
const userProfile = document.getElementById('user-profile');
const userPhoto = document.getElementById('user-photo');
const userName = document.getElementById('user-name');

// Formulario
const transactionForm = document.getElementById('transaction-form');
const inputDate = document.getElementById('t-date');
const inputConcept = document.getElementById('t-concept');
const inputAmount = document.getElementById('t-amount');
const inputType = document.getElementById('t-type');
const inputCategory = document.getElementById('t-category');
const autocompleteList = document.getElementById('autocomplete-list');
const btnSubmitForm = document.getElementById('btn-submit-form');
const submitBtnText = document.getElementById('submit-btn-text');
const submitBtnIcon = document.getElementById('submit-btn-icon');
const btnCancelEdit = document.getElementById('btn-cancel-edit');


// Filtros y Resumen
const filterMonth = document.getElementById('filter-month');
const filterYear = document.getElementById('filter-year');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const totalBalanceEl = document.getElementById('total-balance');

// Tabla
const transactionsTableBody = document.getElementById('transactions-body');
const emptyStateEl = document.getElementById('empty-state');

// Botones de acciones
const btnMonthlyReport = document.getElementById('btn-monthly-report');
const btnExportBackup = document.getElementById('btn-export-backup');
const btnImportTrigger = document.getElementById('btn-import-trigger');
const csvFileInput = document.getElementById('csv-file-input');
const btnClearData = document.getElementById('btn-clear-data');

// Modales
const modalDelete = document.getElementById('modal-delete');
const deleteDetailBox = document.getElementById('delete-detail-box');
const btnDeleteCancel = document.getElementById('btn-delete-cancel');
const btnDeleteConfirm = document.getElementById('btn-delete-confirm');

const modalImport = document.getElementById('modal-import');
const importStatsText = document.getElementById('import-stats-text');
const btnImportCancel = document.getElementById('btn-import-cancel');
const btnImportConfirm = document.getElementById('btn-import-confirm');

const modalClear = document.getElementById('modal-clear');
const btnClearCancel = document.getElementById('btn-clear-cancel');
const btnClearConfirm = document.getElementById('btn-clear-confirm');

const modalPfImport = document.getElementById('modal-pf-import');
const pfImportStatsText = document.getElementById('pf-import-stats-text');
const btnPfImportCancel = document.getElementById('btn-pf-import-cancel');
const btnPfImportConfirm = document.getElementById('btn-pf-import-confirm');

const modalPfClear = document.getElementById('modal-pf-clear');
const btnPfClearCancel = document.getElementById('btn-pf-clear-cancel');
const btnPfClearConfirm = document.getElementById('btn-pf-clear-confirm');

// --- INICIALIZACIoN ---
function initApp() {
    try {
        // 1. Configurar selector de fecha (valor por defecto: hoy, max: hoy)
        const todayStr = getTodayString();
        if (inputDate) {
            inputDate.value = todayStr;
            inputDate.max = todayStr;
        }
        
        if (pfDate) {
            pfDate.value = todayStr;
            pfDate.max = todayStr;
        }

        // 2. Inicializar filtros de fecha y periodo
        if (typeof initFilters === 'function') {
            initFilters();
        }
        if (typeof initPfFilters === 'function') {
            initPfFilters();
        }
        
        // 3. Configurar manejadores de eventos
        setupEventListeners();
        
        // 4. Inicializar selector de idioma personalizado
        if (typeof initCustomLanguageSelector === 'function') {
            initCustomLanguageSelector();
        }
        
        // 5. Inicializar Copilot de Finanzas
        if (typeof initCopilot === 'function') {
            initCopilot();
        }
    } catch (err) {
        console.error("Error en initApp:", err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- ESCUCHAR ESTADO DE AUTENTICACIoN ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Remover clase de vista de login en el body
        document.body.classList.remove('login-view');
        
        // Actualizar perfil de la barra superior
        if (userPhoto) userPhoto.src = user.photoURL || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
        if (userName) userName.textContent = user.displayName || user.email;
        if (userProfile) userProfile.classList.remove('hidden-element');
        
        // Ocultar login
        if (loginSection) loginSection.classList.add('hidden-element');
        
        // Cargar datos defensivamente
        try {
            await loadTransactions();
        } catch (e) {
            console.error("Error al cargar Tesoreria:", e);
        }
        
        try {
            await loadPersonalFinances();
        } catch (e) {
            console.error("Error al cargar Finanzas Personales:", e);
        }
        
        try {
            initFilters();
        } catch (e) {
            console.error("Error al inicializar filtros:", e);
        }
        
        // Mostrar modulo activo (por defecto: 'menu')
        showModule(currentModule);
        
        try {
            render();
        } catch (e) {
            console.error("Error al renderizar:", e);
        }
    } else {
        currentUser = null;
        transactions = [];
        personalExpenses = [];
        personalIncomes = {};
        treasuryCategories = [...DEFAULT_TREASURY_CATEGORIES];
        personalCategories = [...DEFAULT_PERSONAL_CATEGORIES];
        
        // Destruir gr!ficos
        if (pfDonutChartInstance) { pfDonutChartInstance.destroy(); pfDonutChartInstance = null; }
        if (pfBarChartInstance) { pfBarChartInstance.destroy(); pfBarChartInstance = null; }
        if (tDonutChartInstance) { tDonutChartInstance.destroy(); tDonutChartInstance = null; }
        if (tBarChartInstance) { tBarChartInstance.destroy(); tBarChartInstance = null; }
        
        currentModule = 'menu';
        const moduleIndicator = document.getElementById('module-indicator');
        if (moduleIndicator) moduleIndicator.classList.add('hidden-element');
        
        // Agregar clase de vista de login en el body
        document.body.classList.add('login-view');
        
        // Ocultar perfil
        if (userProfile) userProfile.classList.add('hidden-element');
        
        // Mostrar login, ocultar todo lo dem!s
        loginSection.classList.remove('hidden-element');
        dashboardContainer.classList.add('hidden-element');
        menuSection.classList.add('hidden-element');
        personalFinancesContainer.classList.add('hidden-element');
        if (btnBackToMenu) btnBackToMenu.classList.add('hidden-element');
        
        updateCopilotVisibility();
        render();
    }
});

function cleanTextEncoding(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\u00C3\u00B3/g, 'o')
              .replace(/\u00C3\u00AD/g, 'i')
              .replace(/\u00C3\u00BA/g, 'u')
              .replace(/\u00C3\u00A1/g, '!')
              .replace(/\u00C3\u00A9/g, 'e')
              .replace(/\u00C3\u00B1/g, 'n')
              .replace(/\u00C3\u0091/g, 'i')
              .replace(/\u00C3\u009A/g, 'u')
              .replace(/\u00C3\u0093/g, 'o')
              .replace(/\u00C2\u00BF/g, '?')
              .replace(/\u00C2\u00A1/g, '!');
}

async function migrateDataEncoding() {
    let modified = false;

    // 1. Limpiar categorias personales
    if (personalCategories && Array.isArray(personalCategories)) {
        personalCategories = personalCategories.map(cat => {
            const cleanName = cleanTextEncoding(cat.name);
            if (cleanName !== cat.name) {
                cat.name = cleanName;
                modified = true;
            }
            return cat;
        });
    }

    // 2. Limpiar categorias de tesoreria
    if (treasuryCategories && Array.isArray(treasuryCategories)) {
        treasuryCategories = treasuryCategories.map(cat => {
            const cleanName = cleanTextEncoding(cat.name);
            if (cleanName !== cat.name) {
                cat.name = cleanName;
                modified = true;
            }
            return cat;
        });
    }

    // 3. Limpiar transacciones de tesoreria
    if (transactions && Array.isArray(transactions)) {
        transactions = transactions.map(t => {
            const cleanCat = cleanTextEncoding(t.categoria);
            const cleanCon = cleanTextEncoding(t.concepto);
            if (cleanCat !== t.categoria || cleanCon !== t.concepto) {
                t.categoria = cleanCat;
                t.concepto = cleanCon;
                modified = true;
            }
            return t;
        });
    }

    // 4. Limpiar gastos personales
    if (personalExpenses && Array.isArray(personalExpenses)) {
        personalExpenses = personalExpenses.map(pe => {
            const cleanCat = cleanTextEncoding(pe.categoria);
            const cleanCon = cleanTextEncoding(pe.concepto);
            if (cleanCat !== pe.categoria || cleanCon !== pe.concepto) {
                pe.categoria = cleanCat;
                pe.concepto = cleanCon;
                modified = true;
            }
            return pe;
        });
    }

    if (modified) {
        console.warn("Se detecto y reparo codificacion de texto danada en los datos almacenados.");
        try {
            await saveTransactions();
            await savePersonalFinances();
        } catch (err) {
            console.error("Error al guardar migracion de codificacion: ", err);
        }
    }
}

// --- FUNCIONES DE MODALES Y GESTIoN DE ESPACIOS ---

let currentPassphraseIsSwitching = false;

function openPassphraseModal(moduleName, isSwitchingSpace = false) {
    currentPassphraseModalModule = moduleName;
    currentPassphraseIsSwitching = isSwitchingSpace;

    const modal = document.getElementById('modal-module-passphrase');
    const title = document.getElementById('passphrase-modal-title');
    const inputPass = document.getElementById('passphrase-input');
    const blockedAlert = document.getElementById('passphrase-blocked-alert');
    const btnSkip = document.getElementById('btn-passphrase-skip');
    const btnReturnLocal = document.getElementById('btn-return-local-space');
    const activeSpace = moduleName === 'tesoreria' ? activeTreasurySpace : activePersonalSpace;

    if (title) title.textContent = moduleName === 'tesoreria' ? 'Acceso a Tesoreria' : 'Acceso a Finanzas Personales';
    if (inputPass) inputPass.value = '';
    if (blockedAlert) blockedAlert.classList.add('hidden-element');

    if (btnReturnLocal) {
        if (activeSpace.hash && isSwitchingSpace) {
            btnReturnLocal.style.display = 'block';
            btnReturnLocal.innerHTML = 'Volver a mi cuenta local';
        } else {
            btnReturnLocal.style.display = 'none';
        }
    }

    if (btnSkip) {
        if (isSwitchingSpace) {
            btnSkip.innerHTML = 'Cerrar';
        } else {
            btnSkip.innerHTML = ' Continuar a mi Cuenta Personal (Sin Passphrase)';
        }
    }

    renderSavedWorkspacesList();
    openModal(modal);
}

function closePassphraseModal() {
    const modal = document.getElementById('modal-module-passphrase');
    if (modal) closeModal(modal);
}

function renderSavedWorkspacesList() {
    const listContainer = document.getElementById('saved-workspaces-list');
    if (!listContainer) return;

    const workspaces = userSavedWorkspaces[currentPassphraseModalModule] || [];
    const activeSpace = currentPassphraseModalModule === 'tesoreria' ? activeTreasurySpace : activePersonalSpace;

    if (workspaces.length === 0) {
        listContainer.innerHTML = '';
        return;
    }

    let html = '<h4 style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Tus Espacios Compartidos Guardados:</h4>';
    workspaces.forEach(ws => {
        const isActive = activeSpace.hash === ws.hash;
        const safeName = ws.name ? ws.name.replace(/'/g, "\\'") : 'Espacio Compartido';
        const safePass = ws.passphrase ? ws.passphrase.replace(/'/g, "\\'") : '';
        html += `
            <div class="workspace-option-card ${isActive ? 'active' : ''}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 12px 14px; border-radius: 8px; margin-bottom: 8px; transition: all 0.2s;" onclick="selectSavedWorkspace('${currentPassphraseModalModule}', '${ws.hash}', '${safeName}', '${safePass}')">
                <div class="workspace-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--text-color);">${ws.name || 'Espacio Compartido'}</h4>
                    </div>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted); padding-left: 22px;">Passphrase: ****${ws.passphrase ? ws.passphrase.slice(-3) : ''}</p>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${isActive ? 
                        '<span style="display: inline-flex; align-items: center; gap: 5px; color: #10b981; font-weight: 600; font-size: 0.8rem; background: rgba(16, 185, 129, 0.12); padding: 4px 10px; border-radius: 16px; border: 1px solid rgba(16, 185, 129, 0.3);"><span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 5px #10b981;"></span> Activo</span>' : 
                        '<span style="font-size: 0.82rem; color: var(--primary-color); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">Conectar <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></span>'
                    }
                    <button type="button" class="btn-delete-saved-space" title="Eliminar de mis accesos guardados" onclick="event.stopPropagation(); deleteSavedWorkspace('${currentPassphraseModalModule}', '${ws.hash}')" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #ef4444; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'; this.style.borderColor='#ef4444'" onmouseout="this.style.background='rgba(239, 68, 68, 0.12)'; this.style.borderColor='rgba(239, 68, 68, 0.25)'" aria-label="Eliminar espacio guardado">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

window.deleteSavedWorkspace = async function(moduleName, hash) {
    if (!confirm('¿Deseas eliminar este espacio de tu lista de accesos guardados?')) return;
    const list = userSavedWorkspaces[moduleName] || [];
    userSavedWorkspaces[moduleName] = list.filter(w => w.hash !== hash);
    await saveSavedWorkspacesToUser();
    
    const activeSpace = moduleName === 'tesoreria' ? activeTreasurySpace : activePersonalSpace;
    if (activeSpace.hash === hash) {
        await disconnectActiveSpace(moduleName);
    } else {
        renderSavedWorkspacesList();
    }
    showToast('Espacio eliminado de tus accesos guardados.', 'info');
};

async function disconnectActiveSpace(moduleName) {
    const isTreasury = moduleName === 'tesoreria';
    if (isTreasury) {
        if (treasuryUnsubscribe) { treasuryUnsubscribe(); treasuryUnsubscribe = null; }
        transactions = [];
        activeTreasurySpace = {
            passphrase: '',
            hash: '',
            spaceName: 'Cuenta Personal',
            isOwner: true,
            permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
            isBlocked: false,
            members: {},
            logs: []
        };
        await setupSpaceListener('tesoreria');
        updateSpaceBadgeUI('tesoreria');
        updateModulePermissionUI('tesoreria');
        render();
    } else {
        if (personalUnsubscribe) { personalUnsubscribe(); personalUnsubscribe = null; }
        personalExpenses = [];
        personalIncomes = {};
        activePersonalSpace = {
            passphrase: '',
            hash: '',
            spaceName: 'Cuenta Personal',
            isOwner: true,
            permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
            isBlocked: false,
            members: {},
            logs: []
        };
        await setupSpaceListener('personales');
        updateSpaceBadgeUI('personales');
        updateModulePermissionUI('personales');
        renderPersonalFinances();
    }
    const mmpModal = document.getElementById('modal-manage-passphrase');
    if (mmpModal) closeModal(mmpModal);
    closePassphraseModal();
    renderSavedWorkspacesList();
    showToast('Has vuelto a tu Cuenta Local privada.', 'info');
}

window.selectSavedWorkspace = async function(moduleName, hash, name, passphrase) {
    const isTreasury = moduleName === 'tesoreria';
    const savedList = userSavedWorkspaces[moduleName] || [];
    const savedItem = savedList.find(w => w.hash === hash);
    const effectiveUser = currentUser || auth.currentUser;
    const isLocallyOwned = localStorage.getItem('owned_space_' + hash) === 'true';
    const isSavedOwner = savedItem ? (savedItem.isOwner !== false) : false;
    const isOwner = isLocallyOwned || isSavedOwner || (savedItem && (savedItem.isOwner === true || (savedItem.ownerUid && effectiveUser && savedItem.ownerUid === effectiveUser.uid)));

    if (isTreasury) {
        if (treasuryUnsubscribe) { treasuryUnsubscribe(); treasuryUnsubscribe = null; }
        activeTreasurySpace = {
            passphrase: passphrase || (savedItem ? savedItem.passphrase : ''),
            hash,
            spaceName: name || (savedItem ? savedItem.name : 'Espacio Compartido'),
            isOwner: isOwner,
            permissions: isOwner 
                ? { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false } 
                : { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false },
            isBlocked: false,
            members: {},
            logs: []
        };
        await setupSpaceListener('tesoreria');
        updateSpaceBadgeUI('tesoreria');
        updateModulePermissionUI('tesoreria');
        render();
    } else {
        if (personalUnsubscribe) { personalUnsubscribe(); personalUnsubscribe = null; }
        activePersonalSpace = {
            passphrase: passphrase || (savedItem ? savedItem.passphrase : ''),
            hash,
            spaceName: name || (savedItem ? savedItem.name : 'Espacio Compartido'),
            isOwner: isOwner,
            permissions: isOwner 
                ? { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false } 
                : { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false },
            isBlocked: false,
            members: {},
            logs: []
        };
        await setupSpaceListener('personales');
        updateSpaceBadgeUI('personales');
        updateModulePermissionUI('personales');
        renderPersonalFinances();
    }
    closePassphraseModal();
    showModule(moduleName);
    showToast(`Conectado al espacio '${name}'`, 'success');
};

let currentMmpMode = 'edit';

function setMmpMode(mode) {
    currentMmpMode = mode;
    const tabEdit = document.getElementById('mmp-tab-edit');
    const tabMembers = document.getElementById('mmp-tab-members');
    const tabCreate = document.getElementById('mmp-tab-create');

    const sectionConfig = document.getElementById('mmp-section-config');
    const sectionMembers = document.getElementById('mmp-section-members');

    const sectionTitle = document.getElementById('mmp-section-title');
    const sectionDesc = document.getElementById('mmp-section-desc');
    const copyContainer = document.getElementById('mmp-copy-local-container');
    const submitBtn = document.getElementById('mmp-space-submit-btn');
    const inputName = document.getElementById('mmp-space-name-input');
    const inputPass = document.getElementById('mmp-passphrase-input');
    const disconnectContainer = document.getElementById('mmp-disconnect-container');
    const disconnectBtn = document.getElementById('btn-mmp-disconnect');
    const isTreasury = currentManagePassphraseModule === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;

    // Reset styles on tabs
    [tabEdit, tabMembers, tabCreate].forEach(tab => {
        if (tab) {
            tab.style.background = 'transparent';
            tab.style.color = 'var(--text-muted)';
        }
    });

    if (sectionConfig) sectionConfig.style.display = 'none';
    if (sectionMembers) sectionMembers.style.display = 'none';

    if (mode === 'edit') {
        if (tabEdit) {
            tabEdit.style.background = 'var(--primary-color)';
            tabEdit.style.color = 'white';
        }
        if (sectionConfig) sectionConfig.style.display = 'block';
        if (sectionTitle) sectionTitle.textContent = 'Configurar Nombre y Passphrase';
        if (sectionDesc) sectionDesc.textContent = 'Modifica los datos de este espacio activo. Al cambiar el nombre o clave se actualizarán para todos.';
        if (copyContainer) copyContainer.style.display = 'none';
        if (submitBtn) submitBtn.textContent = 'Guardar Cambios en mi Espacio Activo';

        const savedLocalName = isTreasury ? localStorage.getItem('treasury_space_name') : localStorage.getItem('personal_space_name');
        const savedLocalPass = isTreasury ? localStorage.getItem('treasury_passphrase') : localStorage.getItem('personal_passphrase');

        if (inputName) inputName.value = activeSpace.spaceName || savedLocalName || 'Cuenta Personal';
        if (inputPass) inputPass.value = activeSpace.passphrase || savedLocalPass || '';

        if (disconnectContainer && disconnectBtn) {
            if (activeSpace.hash) {
                disconnectContainer.style.display = 'block';
                disconnectBtn.textContent = activeSpace.isOwner ? 'Dejar de Compartir este Espacio (Volver a Cuenta Local)' : 'Desconectarme de este Espacio (Volver a mi Cuenta Local)';
            } else {
                if (activeSpace.passphrase || savedLocalPass) {
                    disconnectContainer.style.display = 'block';
                    disconnectBtn.textContent = 'Eliminar Passphrase (Hacer espacio privado exclusivo)';
                } else {
                    disconnectContainer.style.display = 'none';
                }
            }
        }
    } else if (mode === 'members') {
        if (tabMembers) {
            tabMembers.style.background = 'var(--primary-color)';
            tabMembers.style.color = 'white';
        }
        if (sectionMembers) sectionMembers.style.display = 'block';
        renderMembersTable(currentManagePassphraseModule);
    } else if (mode === 'create') {
        if (tabCreate) {
            tabCreate.style.background = 'var(--primary-color)';
            tabCreate.style.color = 'white';
        }
        if (sectionConfig) sectionConfig.style.display = 'block';
        if (sectionTitle) sectionTitle.textContent = 'Crear un Nuevo Espacio Compartido';
        if (sectionDesc) sectionDesc.textContent = 'Asigna un nombre y frase de acceso a un espacio nuevo. Puedes iniciar en blanco o copiar tus datos actuales.';
        if (copyContainer) copyContainer.style.display = 'flex';
        if (submitBtn) submitBtn.textContent = 'Crear y Conectarme a este Nuevo Espacio';

        if (inputName) inputName.value = '';
        if (inputPass) inputPass.value = '';
        if (disconnectContainer) disconnectContainer.style.display = 'none';
    }
}

async function openManagePassphraseModal(moduleName) {
    currentManagePassphraseModule = moduleName;
    const modal = document.getElementById('modal-manage-passphrase');
    const title = document.getElementById('mmp-modal-title');
    const transferSection = document.getElementById('mmp-transfer-section');
    const badgeEl = document.getElementById('mmp-current-space-badge');
    const descEl = document.getElementById('mmp-current-space-desc');
    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;

    const moduleTitle = isTreasury ? 'Tesorería' : 'Finanzas Personales';
    if (title) title.textContent = `Configurar Espacio: ${moduleTitle}`;

    setMmpMode('edit');

    // Determinar hash para cargar miembros
    let spaceHash = activeSpace.hash;
    const localPass = activeSpace.passphrase || (isTreasury ? localStorage.getItem('treasury_passphrase') : localStorage.getItem('personal_passphrase')) || '';
    if (!spaceHash && localPass) {
        spaceHash = await hashPassphrase(moduleName, localPass);
    }

    // Actualizar banner de espacio activo
    if (badgeEl && descEl) {
        if (!activeSpace.hash) {
            badgeEl.textContent = `${activeSpace.spaceName || 'Cuenta Personal (Google)'} (Espacio Local)`;
            descEl.innerHTML = `<strong>Acción:</strong> Estás modificando tu espacio actual. Si agregas una Passphrase abajo, tus datos actuales se protegerán y podrás compartirlos con otros.`;
        } else {
            badgeEl.textContent = `${activeSpace.spaceName || 'Espacio Compartido'} (Espacio Conectado)`;
            descEl.innerHTML = `<strong>Acción:</strong> Estás modificando este espacio compartido activo. Los cambios se guardarán directamente en este espacio.`;
        }
    }

    if (spaceHash && db) {
        try {
            const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
            const spaceDocRef = doc(db, collectionName, spaceHash);
            const docSnap = await getDoc(spaceDocRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                activeSpace.members = data.members || {};
            }
        } catch (mErr) {
            console.warn("Error cargando integrantes del espacio:", mErr);
        }
    }

    // Actualizar contador en la pestaña de Integrantes
    const membersBadge = document.getElementById('mmp-tab-members-badge');
    if (membersBadge) {
        const memCount = Object.keys(activeSpace.members || {}).filter(uid => !currentUser || uid !== currentUser.uid).length;
        membersBadge.textContent = memCount > 0 ? `${memCount}` : '';
        membersBadge.style.display = memCount > 0 ? 'inline-block' : 'none';
    }

    if (transferSection) {
        const isOwner = activeSpace.isOwner || !activeSpace.hash;
        transferSection.style.display = (moduleName === 'tesoreria' && isOwner) ? 'block' : 'none';
    }

    renderMembersTable(moduleName);
    openModal(modal);
}

function renderMembersTable(moduleName) {
    const tbody = document.getElementById('mmp-members-tbody');
    if (!tbody) return;

    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;
    const members = activeSpace.members || {};
    const memberKeys = Object.keys(members);

    // Filtrar al usuario actual para mostrar a los demas integrantes
    const otherMemberKeys = memberKeys.filter(uid => {
        if (!currentUser) return true;
        return uid !== currentUser.uid;
    });

    if (otherMemberKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:18px; color:var(--text-muted); font-size:0.85rem;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span>No hay otros integrantes conectados aún con esta passphrase.</span>
            </div>
        </td></tr>`;
        return;
    }

    let html = '';
    otherMemberKeys.forEach(uid => {
        const m = members[uid];
        const p = m.permissions || {};
        const allowAdd = p.allowAdd !== undefined ? p.allowAdd : true;
        const allowEdit = p.allowEdit === true;
        const allowDelete = p.allowDelete === true;
        const isReadOnly = p.isReadOnly === true || (!allowAdd && !allowEdit && !allowDelete);
        const isBlocked = m.isBlocked === true;

        html += `
            <tr>
                <td style="padding: 10px 14px;">
                    <strong style="color:var(--text-color); font-size:0.88rem;">${m.displayName || 'Usuario'}</strong><br>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${m.email || 'Sin correo'}</span>
                </td>
                <td style="text-align:center; padding: 10px 14px;">
                    <input type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:var(--primary-color);" ${allowAdd && !isReadOnly ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''} onchange="updateMemberPermission('${moduleName}', '${uid}', 'allowAdd', this.checked)">
                </td>
                <td style="text-align:center; padding: 10px 14px;">
                    <input type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:var(--primary-color);" ${allowEdit && !isReadOnly ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''} onchange="updateMemberPermission('${moduleName}', '${uid}', 'allowEdit', this.checked)">
                </td>
                <td style="text-align:center; padding: 10px 14px;">
                    <input type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:var(--primary-color);" ${allowDelete && !isReadOnly ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''} onchange="updateMemberPermission('${moduleName}', '${uid}', 'allowDelete', this.checked)">
                </td>
                <td style="text-align:center; padding: 10px 14px;">
                    <input type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:var(--primary-color);" ${isReadOnly ? 'checked' : ''} onchange="updateMemberPermission('${moduleName}', '${uid}', 'isReadOnly', this.checked)">
                </td>
                <td style="text-align:center; padding: 10px 14px;">
                    <input type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:#ef4444;" ${isBlocked ? 'checked' : ''} onchange="updateMemberPermission('${moduleName}', '${uid}', 'isBlocked', this.checked)">
                </td>
                <td style="text-align:center; padding: 10px 14px;">
                    <button type="button" class="btn-cat-action btn-cat-delete" onclick="removeMember('${moduleName}', '${uid}')" title="Quitar usuario de este espacio" style="background:rgba(239, 68, 68, 0.12); border:1px solid rgba(239, 68, 68, 0.25); color:#ef4444; border-radius:6px; width:30px; height:30px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.updateMemberPermission = async function(moduleName, uid, field, value) {
    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;
    const isOwner = activeSpace.isOwner || !activeSpace.hash;
    if (!isOwner) return;

    let spaceHash = activeSpace.hash;
    const localPass = activeSpace.passphrase || (isTreasury ? localStorage.getItem('treasury_passphrase') : localStorage.getItem('personal_passphrase')) || '';
    if (!spaceHash && localPass) {
        spaceHash = await hashPassphrase(moduleName, localPass);
    }
    if (!spaceHash) return;

    if (activeSpace.members[uid]) {
        if (field === 'isBlocked') {
            activeSpace.members[uid].isBlocked = value;
        } else if (field === 'isReadOnly') {
            activeSpace.members[uid].permissions = activeSpace.members[uid].permissions || {};
            activeSpace.members[uid].permissions.isReadOnly = value;
            if (value) {
                activeSpace.members[uid].permissions.allowAdd = false;
                activeSpace.members[uid].permissions.allowEdit = false;
                activeSpace.members[uid].permissions.allowDelete = false;
            } else {
                activeSpace.members[uid].permissions.allowAdd = true;
            }
        } else {
            activeSpace.members[uid].permissions = activeSpace.members[uid].permissions || {};
            activeSpace.members[uid].permissions[field] = value;
            const p = activeSpace.members[uid].permissions;
            if (p.allowAdd || p.allowEdit || p.allowDelete) {
                p.isReadOnly = false;
            } else {
                p.isReadOnly = true;
            }
        }

        const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
        const docRef = doc(db, collectionName, spaceHash);
        await updateDoc(docRef, {
            members: activeSpace.members
        });
        renderMembersTable(moduleName);
        showToast('Permisos actualizados correctamente', 'info');
    }
};

window.removeMember = async function(moduleName, uid) {
    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;
    const isOwner = activeSpace.isOwner || !activeSpace.hash;
    if (!isOwner) return;

    let spaceHash = activeSpace.hash;
    const localPass = activeSpace.passphrase || (isTreasury ? localStorage.getItem('treasury_passphrase') : localStorage.getItem('personal_passphrase')) || '';
    if (!spaceHash && localPass) {
        spaceHash = await hashPassphrase(moduleName, localPass);
    }
    if (!spaceHash) return;

    if (confirm('¿Deseas remover el acceso a este integrante?')) {
        delete activeSpace.members[uid];
        const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
        const docRef = doc(db, collectionName, spaceHash);
        await updateDoc(docRef, {
            members: activeSpace.members
        });
        showToast('Integrante removido del espacio', 'info');
        renderMembersTable(moduleName);
    }
};

async function openActivityLogsModal(moduleName) {
    currentLogsModalModule = moduleName;
    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;
    const modal = document.getElementById('modal-activity-logs');

    if (activeSpace.hash && db) {
        // Espacio Compartido Activo -> Cargar desde shared_tesoreria / shared_personales
        try {
            const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
            const spaceDocRef = doc(db, collectionName, activeSpace.hash);
            const docSnap = await getDoc(spaceDocRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (Array.isArray(data.logs)) {
                    activeSpace.logs = data.logs;
                }
            }
        } catch (lErr) {
            console.warn("Aviso cargando logs de Firestore:", lErr);
        }
    } else if (currentUser && db) {
        // Cuenta Local Privada -> Cargar desde users/{uid}
        try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                const uData = userSnap.data();
                const userLogs = isTreasury ? (uData.treasuryLogs || uData.logs) : (uData.personalLogs || uData.logs);
                if (Array.isArray(userLogs) && userLogs.length > 0) {
                    activeSpace.logs = userLogs;
                }
            }
        } catch (uErr) {
            console.warn("Aviso cargando logs locales del usuario:", uErr);
        }
    }

    // Si aún no hay logs en memoria o estamos offline/local, leer de localStorage
    if (!activeSpace.logs || activeSpace.logs.length === 0) {
        const localLogsKey = isTreasury ? 'treasury_logs' : 'pf_logs';
        const savedLogs = localStorage.getItem(localLogsKey);
        if (savedLogs) {
            try {
                activeSpace.logs = JSON.parse(savedLogs);
            } catch(e) {}
        }
    }

    renderAuditLogsModal(moduleName);
    openModal(modal);
}
window.openActivityLogsModal = openActivityLogsModal;
window.renderAuditLogsModal = renderAuditLogsModal;

function renderAuditLogsModal(moduleName) {
    const tbody = document.getElementById('logs-tbody');
    if (!tbody) return;

    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;
    const logs = activeSpace.logs || [];

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--text-muted);">No hay eventos de actividad registrados aún en este espacio.</td></tr>';
        return;
    }

    let html = '';
    logs.forEach(log => {
        let badgeClass = 'badge-action-crear';
        if (log.action === 'EDITAR') badgeClass = 'badge-action-editar';
        else if (log.action === 'ELIMINAR') badgeClass = 'badge-action-eliminar';
        else if (log.action === 'TRANSFERIR_PROPIEDAD') badgeClass = 'badge-action-transferir';

        html += `
            <tr>
                <td style="white-space:nowrap; font-size:0.78rem;">${log.timestamp || ''}</td>
                <td style="font-size:0.8rem;">${log.userEmail || 'Usuario'}</td>
                <td><span class="badge-action ${badgeClass}">${log.action || 'CREAR'}</span></td>
                <td style="font-size:0.8rem;">${log.details || ''}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// --- FUNCIONES DE PERSISTENCIA Y CARGA ---

async function loadTransactions() {
    try {
        const stored = localStorage.getItem('transacciones');
        if (stored) transactions = JSON.parse(stored);
        else transactions = [];
        
        const storedCats = localStorage.getItem('treasury_categories');
        if (storedCats) treasuryCategories = JSON.parse(storedCats);
        else treasuryCategories = [...DEFAULT_TREASURY_CATEGORIES];

        const storedLogs = localStorage.getItem('treasury_logs');
        if (storedLogs) activeTreasurySpace.logs = JSON.parse(storedLogs);
        else activeTreasurySpace.logs = [];
    } catch (e) {
        console.error('Error cargando transacciones desde localStorage', e);
        transactions = [];
        treasuryCategories = [...DEFAULT_TREASURY_CATEGORIES];
        activeTreasurySpace.logs = [];
    }
    
    if (currentUser && db) {
        await setupSpaceListener('tesoreria');
    }
    await migrateDataEncoding();
    renderCategoryDatalists();
}

// Guardar metadatos de Tesorería (Categorías, Logs, Nombre) en el documento raíz
async function saveTransactionsMetadata() {
    try {
        localStorage.setItem('treasury_categories', JSON.stringify(treasuryCategories));
        localStorage.setItem('treasury_logs', JSON.stringify(activeTreasurySpace.logs || []));
    } catch (e) {
        console.error('Error guardando metadatos de tesorería en localStorage', e);
    }
    
    if (currentUser && db) {
        try {
            if (activeTreasurySpace.hash) {
                const spaceDocRef = doc(db, 'shared_tesoreria', activeTreasurySpace.hash);
                const updateObj = {
                    treasuryCategories: sanitizeData(treasuryCategories),
                    logs: (activeTreasurySpace.logs || []).slice(0, 50),
                    updatedAt: new Date().toISOString()
                };
                if (activeTreasurySpace.isOwner && activeTreasurySpace.spaceName && activeTreasurySpace.spaceName !== 'Espacio Compartido') {
                    updateObj.spaceName = activeTreasurySpace.spaceName;
                }
                await setDoc(spaceDocRef, updateObj, { merge: true });
            } else {
                const userDocRef = doc(db, 'users', currentUser.uid);
                await setDoc(userDocRef, {
                    treasuryCategories: sanitizeData(treasuryCategories),
                    treasuryLogs: (activeTreasurySpace.logs || []).slice(0, 50),
                    logs: (activeTreasurySpace.logs || []).slice(0, 50),
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        } catch (error) {
            console.error("Error al guardar metadatos en Firestore: ", error);
        }
    }
}

// Compatibilidad hacia atrás: guarda transacciones y metadatos
async function saveTransactions() {
    try {
        localStorage.setItem('transacciones', JSON.stringify(transactions));
    } catch (e) {}
    await saveTransactionsMetadata();
}

function initFilters() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    filterMonth.value = currentMonth;
    
    // Rellenar años disponibles dinámicamente
    populateYearFilter(currentYear);
}

function populateYearFilter(defaultYear) {
    const years = new Set();
    years.add(defaultYear);
    years.add(defaultYear - 1);
    years.add(defaultYear + 1);
    
    transactions.forEach(t => {
        if (t.fecha) {
            const y = parseInt(t.fecha.split('-')[0]);
            if (!isNaN(y)) years.add(y);
        }
    });
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    
    filterYear.innerHTML = '';
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === defaultYear) {
            option.selected = true;
        }
        filterYear.appendChild(option);
    });
}

function initPfFilters() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    if (pfFilterMonth) {
        pfFilterMonth.value = currentMonth;
    }
    
    populatePfYearFilter(currentYear);
}

function populatePfYearFilter(defaultYear) {
    if (!pfFilterYear) return;
    
    const years = new Set();
    years.add(defaultYear);
    years.add(defaultYear - 1);
    years.add(defaultYear + 1);
    
    personalExpenses.forEach(e => {
        if (e.fecha) {
            const y = parseInt(e.fecha.split('-')[0]);
            if (!isNaN(y)) years.add(y);
        }
    });
    
    Object.keys(personalIncomes).forEach(periodKey => {
        if (periodKey) {
            const y = parseInt(periodKey.split('-')[0]);
            if (!isNaN(y)) years.add(y);
        }
    });
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    const currentSel = pfFilterYear.value;
    
    pfFilterYear.innerHTML = '';
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (currentSel && year.toString() === currentSel.toString()) {
            option.selected = true;
        } else if (!currentSel && year === defaultYear) {
            option.selected = true;
        }
        pfFilterYear.appendChild(option);
    });
    
    if (!pfFilterYear.value && sortedYears.length > 0) {
        pfFilterYear.value = defaultYear;
    }
}

// --- CONFIGURACIÓN DE LISTENERS EN TIEMPO REAL CON SUBCOLECCIONES ---

async function setupSpaceListener(moduleName) {
    if (!currentUser || !db) {
        if (moduleName === 'tesoreria') render();
        else renderPersonalFinances();
        return;
    }
    
    if (moduleName === 'tesoreria') {
        if (treasuryUnsubscribe) { treasuryUnsubscribe(); treasuryUnsubscribe = null; }
        if (treasurySubcolUnsubscribe) { treasurySubcolUnsubscribe(); treasurySubcolUnsubscribe = null; }
        
        const isShared = Boolean(activeTreasurySpace.hash);
        const rootDocRef = isShared 
            ? doc(db, 'shared_tesoreria', activeTreasurySpace.hash) 
            : doc(db, 'users', currentUser.uid);

        // 1. Escuchar documento raíz (Metadatos: Nombre, Integrantes, Permisos, Logs, Categorías)
        treasuryUnsubscribe = onSnapshot(rootDocRef, async (docSnap) => {
            if (!docSnap.exists()) {
                if (isShared) {
                    console.warn("El espacio de tesorería no existe. Desconectando...");
                    showToast("El espacio no existe o la clave es incorrecta.", "error");
                    disconnectActiveSpace('tesoreria');
                    return;
                }
            } else {
                const data = docSnap.data();
                
                // Auto-migración si existen transacciones en el array antiguo
                await migrateLegacyTreasuryData(data, rootDocRef);

                if (isShared) {
                    if (data.pendingOwnerTransfer && data.ownerEmail && data.ownerEmail.toLowerCase() === currentUser.email.toLowerCase()) {
                        await updateDoc(rootDocRef, {
                            ownerUid: currentUser.uid,
                            pendingOwnerTransfer: false,
                            logs: [
                                {
                                    id: Date.now().toString(),
                                    timestamp: new Date().toLocaleString(),
                                    userEmail: currentUser.email,
                                    action: 'TRANSFERIR_PROPIEDAD',
                                    details: `Asumió el cargo de Tesorero Principal por transferencia.`
                                },
                                ...(data.logs || []).slice(0, 49)
                            ]
                        });
                        showToast('🎉 ¡Bienvenido! Has sido reconocido como el nuevo Tesorero Principal de este espacio.', 'success');
                    }
                    
                    const savedList = userSavedWorkspaces['tesoreria'] || [];
                    const savedEntry = savedList.find(w => w.hash === activeTreasurySpace.hash);
                    const isLocallyOwned = localStorage.getItem('owned_space_' + activeTreasurySpace.hash) === 'true';
                    const isSavedOwner = savedEntry ? (savedEntry.isOwner !== false) : false;
                    const isFirestoreOwner = (data.ownerUid && currentUser && data.ownerUid === currentUser.uid) ||
                                            (data.ownerEmail && currentUser && currentUser.email && data.ownerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
                                            (!data.ownerUid || data.ownerUid === 'local_user');

                    const isOwner = isLocallyOwned || isSavedOwner || isFirestoreOwner || activeTreasurySpace.isOwner === true;
                    activeTreasurySpace.isOwner = isOwner;

                    let officialName = data.spaceName;
                    if (!officialName || officialName === 'Espacio Compartido') {
                        if (savedEntry && savedEntry.name && savedEntry.name !== 'Espacio Compartido') {
                            officialName = savedEntry.name;
                            updateDoc(rootDocRef, { spaceName: officialName }).catch(e => console.warn("Aviso auto-reparando nombre:", e));
                        }
                    }

                    if (isOwner && currentUser && data.ownerUid !== currentUser.uid) {
                        updateDoc(rootDocRef, { ownerUid: currentUser.uid, ownerEmail: currentUser.email || '' }).catch(e => console.warn("Error auto-reparando ownerUid:", e));
                    }

                    if (officialName) {
                        activeTreasurySpace.spaceName = officialName;
                        const savedList = userSavedWorkspaces['tesoreria'] || [];
                        const savedEntry = savedList.find(w => w.hash === activeTreasurySpace.hash);
                        if (savedEntry && savedEntry.name !== officialName) {
                            savedEntry.name = officialName;
                            userSavedWorkspaces['tesoreria'] = savedList;
                            saveSavedWorkspacesToUser();
                        }
                    }

                    activeTreasurySpace.members = data.members || {};
                    activeTreasurySpace.logs = (data.logs || []).slice(0, 50);
                    
                    if (!activeTreasurySpace.members[currentUser.uid] && !isOwner) {
                        activeTreasurySpace.members[currentUser.uid] = {
                            email: currentUser.email,
                            displayName: currentUser.displayName || currentUser.email.split('@')[0],
                            joinedAt: new Date().toISOString(),
                            isBlocked: false,
                            permissions: { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false }
                        };
                        await updateDoc(rootDocRef, {
                            members: activeTreasurySpace.members
                        });
                    }
                    
                    const userMemberData = activeTreasurySpace.members[currentUser.uid];
                    const isBlocked = userMemberData ? userMemberData.isBlocked : false;
                    activeTreasurySpace.isBlocked = isBlocked;
                    
                    if (isBlocked) {
                        showToast('Acceso Restringido: Tu cuenta ha sido bloqueada para este módulo.', 'error');
                        const blockedAlert = document.getElementById('passphrase-blocked-alert');
                        if (blockedAlert) blockedAlert.classList.remove('hidden-element');
                        openPassphraseModal('tesoreria');
                        return;
                    }
                    
                    if (isOwner) {
                        activeTreasurySpace.permissions = { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false };
                    } else {
                        const rawP = userMemberData ? userMemberData.permissions : {};
                        const isReadOnly = rawP && rawP.isReadOnly === true;
                        const allowAdd = !isReadOnly && (rawP && rawP.allowAdd !== undefined ? rawP.allowAdd : true);
                        const allowEdit = !isReadOnly && (rawP && rawP.allowEdit === true);
                        const allowDelete = !isReadOnly && (rawP && rawP.allowDelete === true);
                        activeTreasurySpace.permissions = {
                            allowAdd,
                            allowEdit,
                            allowDelete,
                            isReadOnly
                        };
                    }
                    
                    if (data.treasuryCategories && Array.isArray(data.treasuryCategories)) {
                        treasuryCategories = data.treasuryCategories;
                    }
                } else {
                    // Local / Personal
                    const localName = data.treasurySpaceName || localStorage.getItem('treasury_space_name') || 'Cuenta Personal';
                    const localPass = data.treasuryPassphrase || localStorage.getItem('treasury_passphrase') || '';
                    activeTreasurySpace.spaceName = localName;
                    activeTreasurySpace.passphrase = localPass;
                    localStorage.setItem('treasury_space_name', localName);
                    if (localPass) localStorage.setItem('treasury_passphrase', localPass);
                    
                    if (data.treasuryCategories && Array.isArray(data.treasuryCategories)) {
                        treasuryCategories = data.treasuryCategories;
                    }
                    if (data.treasuryLogs && Array.isArray(data.treasuryLogs)) {
                        activeTreasurySpace.logs = data.treasuryLogs.slice(0, 50);
                    } else if (data.logs && Array.isArray(data.logs)) {
                        activeTreasurySpace.logs = data.logs.slice(0, 50);
                    }
                    if (data.savedWorkspaces) userSavedWorkspaces = data.savedWorkspaces;
                    localStorage.setItem('treasury_categories', JSON.stringify(treasuryCategories));
                    localStorage.setItem('treasury_logs', JSON.stringify(activeTreasurySpace.logs || []));
                }
            }
            updateSpaceBadgeUI('tesoreria');
            updateModulePermissionUI('tesoreria');
            renderCategoryDatalists();
            renderAuditLogsModal('tesoreria');
            renderMembersTable('tesoreria');
        }, (err) => {
            console.error("Error en Snapshot Raíz Tesorería:", err);
        });

        // 2. Escuchar la Subcolección de Transacciones (Capacidad Ilimitada y tiempo real)
        const subcolRef = getTreasuryCollectionRef();
        if (subcolRef) {
            treasurySubcolUnsubscribe = onSnapshot(subcolRef, (colSnap) => {
                const fetchedList = [];
                colSnap.forEach((d) => {
                    fetchedList.push({ id: d.id, ...d.data() });
                });
                
                // Ordenar por fecha descendente
                fetchedList.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                transactions = fetchedList;
                localStorage.setItem('transacciones', JSON.stringify(transactions));
                
                const now = new Date();
                populateYearFilter(now.getFullYear());
                render();
            }, (colErr) => {
                console.error("Error escuchando subcolección de transacciones:", colErr);
            });
        }
    } else {
        // --- FINANZAS PERSONALES ---
        if (personalUnsubscribe) { personalUnsubscribe(); personalUnsubscribe = null; }
        if (personalSubcolUnsubscribe) { personalSubcolUnsubscribe(); personalSubcolUnsubscribe = null; }
        
        const isShared = Boolean(activePersonalSpace.hash);
        const rootDocRef = isShared 
            ? doc(db, 'shared_personales', activePersonalSpace.hash) 
            : doc(db, 'users', currentUser.uid);

        // 1. Escuchar documento raíz de Finanzas Personales
        personalUnsubscribe = onSnapshot(rootDocRef, async (docSnap) => {
            if (!docSnap.exists()) {
                if (isShared) {
                    console.warn("El espacio de finanzas personales no existe. Desconectando...");
                    showToast("El espacio no existe o la clave es incorrecta.", "error");
                    disconnectActiveSpace('personales');
                    return;
                }
            } else {
                const data = docSnap.data();
                
                // Auto-migración si existen gastos en el array antiguo
                await migrateLegacyPersonalData(data, rootDocRef);

                if (isShared) {
                    const savedList = userSavedWorkspaces['personales'] || [];
                    const savedEntry = savedList.find(w => w.hash === activePersonalSpace.hash);
                    const isLocallyOwned = localStorage.getItem('owned_space_' + activePersonalSpace.hash) === 'true';
                    const isSavedOwner = savedEntry ? (savedEntry.isOwner !== false) : false;
                    const isFirestoreOwner = (data.ownerUid && currentUser && data.ownerUid === currentUser.uid) ||
                                            (data.ownerEmail && currentUser && currentUser.email && data.ownerEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
                                            (!data.ownerUid || data.ownerUid === 'local_user');

                    const isOwner = isLocallyOwned || isSavedOwner || isFirestoreOwner || activePersonalSpace.isOwner === true;
                    activePersonalSpace.isOwner = isOwner;

                    let officialName = data.spaceName;
                    if (!officialName || officialName === 'Espacio Compartido') {
                        if (savedEntry && savedEntry.name && savedEntry.name !== 'Espacio Compartido') {
                            officialName = savedEntry.name;
                            updateDoc(rootDocRef, { spaceName: officialName }).catch(e => console.warn("Aviso auto-reparando nombre:", e));
                        }
                    }

                    if (isOwner && currentUser && data.ownerUid !== currentUser.uid) {
                        updateDoc(rootDocRef, { ownerUid: currentUser.uid, ownerEmail: currentUser.email || '' }).catch(e => console.warn("Error auto-reparando ownerUid:", e));
                    }

                    if (officialName) {
                        activePersonalSpace.spaceName = officialName;
                        const savedList = userSavedWorkspaces['personales'] || [];
                        const savedEntry = savedList.find(w => w.hash === activePersonalSpace.hash);
                        if (savedEntry && savedEntry.name !== officialName) {
                            savedEntry.name = officialName;
                            userSavedWorkspaces['personales'] = savedList;
                            saveSavedWorkspacesToUser();
                        }
                    }

                    activePersonalSpace.members = data.members || {};
                    activePersonalSpace.logs = (data.logs || []).slice(0, 50);
                    
                    if (!activePersonalSpace.members[currentUser.uid] && !isOwner) {
                        activePersonalSpace.members[currentUser.uid] = {
                            email: currentUser.email || 'invitado@gmail.com',
                            displayName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Invitado'),
                            joinedAt: new Date().toISOString(),
                            isBlocked: false,
                            permissions: { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false }
                        };
                        try {
                            await updateDoc(rootDocRef, {
                                members: activePersonalSpace.members
                            });
                        } catch (memErr) {
                            console.warn("Aviso al registrar miembro en Firestore:", memErr);
                        }
                    }
                    
                    const userMemberData = activePersonalSpace.members[currentUser.uid];
                    const isBlocked = userMemberData ? userMemberData.isBlocked : false;
                    activePersonalSpace.isBlocked = isBlocked;
                    
                    if (isBlocked) {
                        showToast('Acceso Restringido: Tu cuenta ha sido bloqueada para este módulo.', 'error');
                        const blockedAlert = document.getElementById('passphrase-blocked-alert');
                        if (blockedAlert) blockedAlert.classList.remove('hidden-element');
                        openPassphraseModal('personales');
                        return;
                    }
                    
                    if (isOwner) {
                        activePersonalSpace.permissions = { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false };
                    } else {
                        const rawP = userMemberData ? userMemberData.permissions : {};
                        const isReadOnly = rawP && rawP.isReadOnly === true;
                        const allowAdd = !isReadOnly && (rawP && rawP.allowAdd !== undefined ? rawP.allowAdd : true);
                        const allowEdit = !isReadOnly && (rawP && rawP.allowEdit === true);
                        const allowDelete = !isReadOnly && (rawP && rawP.allowDelete === true);
                        activePersonalSpace.permissions = {
                            allowAdd,
                            allowEdit,
                            allowDelete,
                            isReadOnly
                        };
                    }
                    
                    personalIncomes = data.personalIncomes || {};
                    if (data.personalCategories) personalCategories = data.personalCategories;
                } else {
                    // Local / Personal
                    const localName = data.personalSpaceName || localStorage.getItem('personal_space_name') || 'Cuenta Personal';
                    const localPass = data.personalPassphrase || localStorage.getItem('personal_passphrase') || '';
                    activePersonalSpace.spaceName = localName;
                    activePersonalSpace.passphrase = localPass;
                    localStorage.setItem('personal_space_name', localName);
                    if (localPass) localStorage.setItem('personal_passphrase', localPass);
                    
                    if (data.personalIncomes && typeof data.personalIncomes === 'object') {
                        personalIncomes = data.personalIncomes;
                    } else if (data.personalIncome !== undefined) {
                        const legacyVal = parseFloat(data.personalIncome) || 0.00;
                        if (legacyVal > 0) {
                            const now = new Date();
                            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                            personalIncomes = { [currentMonthKey]: legacyVal };
                        } else {
                            personalIncomes = {};
                        }
                    } else {
                        personalIncomes = {};
                    }
                    
                    if (data.personalCategories && Array.isArray(data.personalCategories)) {
                        personalCategories = data.personalCategories;
                    }
                    if (data.personalLogs && Array.isArray(data.personalLogs)) {
                        activePersonalSpace.logs = data.personalLogs.slice(0, 50);
                    } else if (data.logs && Array.isArray(data.logs)) {
                        activePersonalSpace.logs = data.logs.slice(0, 50);
                    }
                    if (data.savedWorkspaces) userSavedWorkspaces = data.savedWorkspaces;
                    
                    localStorage.setItem('pf_incomes', JSON.stringify(personalIncomes));
                    localStorage.setItem('personal_categories', JSON.stringify(personalCategories));
                    localStorage.setItem('pf_logs', JSON.stringify(activePersonalSpace.logs || []));
                }
            }
            updateSpaceBadgeUI('personales');
            updateModulePermissionUI('personales');
            renderCategoryDatalists();
            initPfFilters();
            renderPersonalFinances();
            renderAuditLogsModal('personales');
            renderMembersTable('personales');
        }, (err) => {
            console.error("Error en Snapshot Raíz Finanzas Personales:", err);
        });

        // 2. Escuchar la Subcolección de Gastos Personales
        const expColRef = getPersonalCollectionRef();
        if (expColRef) {
            personalSubcolUnsubscribe = onSnapshot(expColRef, (colSnap) => {
                const fetchedList = [];
                colSnap.forEach((d) => {
                    fetchedList.push({ id: d.id, ...d.data() });
                });
                
                fetchedList.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                personalExpenses = fetchedList;
                localStorage.setItem('pf_expenses', JSON.stringify(personalExpenses));
                
                const now = new Date();
                populatePfYearFilter(now.getFullYear());
                renderPersonalFinances();
            }, (expErr) => {
                console.error("Error escuchando subcolección de gastos personales:", expErr);
            });
        }
    }
}

async function loadPersonalFinances() {
    try {
        const storedExpenses = localStorage.getItem('pf_expenses');
        const storedIncomes = localStorage.getItem('pf_incomes');
        if (storedExpenses) personalExpenses = JSON.parse(storedExpenses);
        else personalExpenses = [];
        const storedCats = localStorage.getItem('personal_categories');
        if (storedCats) personalCategories = JSON.parse(storedCats);
        else personalCategories = [...DEFAULT_PERSONAL_CATEGORIES];
        if (storedIncomes) personalIncomes = JSON.parse(storedIncomes);
        else personalIncomes = {};
        const storedLogs = localStorage.getItem('pf_logs');
        if (storedLogs) activePersonalSpace.logs = JSON.parse(storedLogs);
        else activePersonalSpace.logs = [];
    } catch (e) {
        console.error('Error cargando finanzas personales desde localStorage', e);
        personalExpenses = [];
        personalIncomes = {};
        personalCategories = [...DEFAULT_PERSONAL_CATEGORIES];
        activePersonalSpace.logs = [];
    }
    
    if (currentUser && db) {
        await setupSpaceListener('personales');
    }
    await migrateDataEncoding();
    renderCategoryDatalists();
    initPfFilters();
    renderPersonalFinances();
}

// Guardar metadatos de Finanzas Personales (Presupuesto mensual, Categorías, Logs)
async function savePersonalFinancesMetadata() {
    try {
        localStorage.setItem('pf_incomes', JSON.stringify(personalIncomes));
        localStorage.setItem('personal_categories', JSON.stringify(personalCategories));
        localStorage.setItem('pf_logs', JSON.stringify(activePersonalSpace.logs || []));
    } catch (e) {
        console.error('Error guardando metadatos en localStorage', e);
    }
    
    if (currentUser && db) {
        try {
            if (activePersonalSpace.hash) {
                const spaceDocRef = doc(db, 'shared_personales', activePersonalSpace.hash);
                const updateObj = {
                    personalIncomes: sanitizeData(personalIncomes),
                    personalCategories: sanitizeData(personalCategories),
                    logs: (activePersonalSpace.logs || []).slice(0, 50),
                    updatedAt: new Date().toISOString()
                };
                if (activePersonalSpace.isOwner && activePersonalSpace.spaceName && activePersonalSpace.spaceName !== 'Espacio Compartido') {
                    updateObj.spaceName = activePersonalSpace.spaceName;
                }
                await setDoc(spaceDocRef, updateObj, { merge: true });
            } else {
                const userDocRef = doc(db, 'users', currentUser.uid);
                await setDoc(userDocRef, {
                    personalIncomes: sanitizeData(personalIncomes),
                    personalCategories: sanitizeData(personalCategories),
                    personalLogs: (activePersonalSpace.logs || []).slice(0, 50),
                    logs: (activePersonalSpace.logs || []).slice(0, 50),
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        } catch (e) {
            console.error('Error guardando metadatos de finanzas personales en Firestore', e);
        }
    }
}

// Compatibilidad hacia atrás
async function savePersonalFinances() {
    try {
        localStorage.setItem('pf_expenses', JSON.stringify(personalExpenses));
    } catch (e) {}
    await savePersonalFinancesMetadata();
}


function showModule(moduleName) {
    currentModule = moduleName;
    
    // Ocultar todos
    menuSection.classList.add('hidden-element');
    dashboardContainer.classList.add('hidden-element');
    personalFinancesContainer.classList.add('hidden-element');
    
    // Actualizar indicador del modulo activo en la cabecera
    const moduleIndicator = document.getElementById('module-indicator');
    if (moduleIndicator) {
        if (moduleName === 'tesoreria') {
            moduleIndicator.textContent = 'Tesoreria';
            moduleIndicator.classList.remove('hidden-element');
        } else if (moduleName === 'personales') {
            moduleIndicator.textContent = 'Finanzas Personales';
            moduleIndicator.classList.remove('hidden-element');
        } else {
            moduleIndicator.classList.add('hidden-element');
        }
    }
    
    if (moduleName === 'menu') {
        menuSection.classList.remove('hidden-element');
        if (btnBackToMenu) btnBackToMenu.classList.add('hidden-element');
    } else if (moduleName === 'tesoreria') {
        dashboardContainer.classList.remove('hidden-element');
        if (btnBackToMenu) btnBackToMenu.classList.remove('hidden-element');
        updateSpaceBadgeUI('tesoreria');
        updateModulePermissionUI('tesoreria');
    } else if (moduleName === 'personales') {
        personalFinancesContainer.classList.remove('hidden-element');
        if (btnBackToMenu) btnBackToMenu.classList.remove('hidden-element');
        
        // Abrir siempre en el mes actual y año actual
        const now = new Date();
        if (pfFilterMonth) {
            pfFilterMonth.value = now.getMonth();
        }
        if (pfFilterYear) {
            populatePfYearFilter(now.getFullYear());
            pfFilterYear.value = now.getFullYear();
        }

        updateSpaceBadgeUI('personales');
        updateModulePermissionUI('personales');
        renderPersonalFinances();
    }
    
    updateCopilotVisibility();
}

let isCloningPfExpenses = false;

async function checkAndClonePfExpenses(selYear, selMonth) {
    if (isCloningPfExpenses) return false;
    if (!personalExpenses || personalExpenses.length === 0) return false;
    
    // 1. Filtrar los gastos fijos que pertenecen al mes/año seleccionado
    const currentMonthFixedExpenses = personalExpenses.filter(e => {
        if (!e.fecha || e.tipo !== 'fijo') return false;
        const [y, m] = e.fecha.split('-').map(Number);
        return y === selYear && (m - 1) === selMonth;
    });
    
    // Si ya hay gastos fijos en este mes, no clonar nada para evitar duplicados
    if (currentMonthFixedExpenses.length > 0) return false;
    
    // 2. Buscar el mes más cercano en el pasado que contenga gastos fijos
    let bestPastYear = -1;
    let bestPastMonth = -1;
    let maxTimeVal = -1;
    
    personalExpenses.forEach(e => {
        if (!e.fecha || e.tipo !== 'fijo') return;
        const [y, m] = e.fecha.split('-').map(Number);
        const mIdx = m - 1;
        
        if (y < selYear || (y === selYear && mIdx < selMonth)) {
            const timeVal = y * 12 + mIdx;
            if (timeVal > maxTimeVal) {
                maxTimeVal = timeVal;
                bestPastYear = y;
                bestPastMonth = mIdx;
            }
        }
    });
    
    // Si no se encontró ningún periodo anterior con gastos fijos, salir
    if (maxTimeVal === -1) return false;
    
    // 3. Obtener ÚNICAMENTE los gastos FIJOS del periodo origen (NO variables)
    const sourceFixedExpenses = personalExpenses.filter(e => {
        if (!e.fecha || e.tipo !== 'fijo') return false;
        const [y, m] = e.fecha.split('-').map(Number);
        return y === bestPastYear && (m - 1) === bestPastMonth;
    });
    
    if (sourceFixedExpenses.length === 0) return false;
    
    isCloningPfExpenses = true;
    try {
        // 4. Clonar exclusivamente los gastos fijos al nuevo periodo
        const clonedExpenses = [];
        const targetMonthStr = String(selMonth + 1).padStart(2, '0');
        const targetPeriodKey = `${selYear}-${targetMonthStr}`;
        
        // Obtener último día del mes destino
        const lastDayOfTargetMonth = new Date(selYear, selMonth + 1, 0).getDate();
        
        sourceFixedExpenses.forEach(e => {
            let origDay = 1;
            if (e.fecha) {
                const parts = e.fecha.split('-');
                origDay = parseInt(parts[2]) || 1;
            }
            
            const targetDay = Math.min(origDay, lastDayOfTargetMonth);
            const targetDayStr = String(targetDay).padStart(2, '0');
            const newFecha = `${selYear}-${targetMonthStr}-${targetDayStr}`;
            
            clonedExpenses.push({
                id: 'pf-' + Date.now() + Math.random().toString(36).substr(2, 6) + '-' + Math.floor(Math.random() * 1000),
                concepto: e.concepto,
                monto: e.monto,
                tipo: 'fijo',
                categoria: e.categoria || '',
                estado: 'pagar', // Inicia pendiente en el nuevo mes
                fecha: newFecha,
                createdAt: new Date().toISOString()
            });
        });
        
        // Copiar también el presupuesto si no está configurado en el mes destino
        if (!personalIncomes[targetPeriodKey]) {
            const sourcePeriodKey = `${bestPastYear}-${String(bestPastMonth + 1).padStart(2, '0')}`;
            const sourceIncome = personalIncomes[sourcePeriodKey];
            if (sourceIncome !== undefined) {
                personalIncomes[targetPeriodKey] = sourceIncome;
            }
        }
        
        // 5. Guardar en Firestore (subcolección gastos_personales) para que no se borren en sincronizaciones
        const expColRef = getPersonalCollectionRef();
        if (currentUser && db && expColRef && clonedExpenses.length > 0) {
            try {
                for (let i = 0; i < clonedExpenses.length; i += 400) {
                    const batch = writeBatch(db);
                    const chunk = clonedExpenses.slice(i, i + 400);
                    chunk.forEach(exp => {
                        batch.set(doc(expColRef, exp.id), sanitizeData(exp));
                    });
                    await batch.commit();
                }
            } catch (fsErr) {
                console.error("Error guardando gastos fijos clonados en Firestore:", fsErr);
            }
        }
        
        // 6. Actualizar memoria local y metadatos
        personalExpenses = [...clonedExpenses, ...personalExpenses];
        try {
            localStorage.setItem('pf_expenses', JSON.stringify(personalExpenses));
        } catch (e) {}
        await savePersonalFinancesMetadata();
        
        showToast(`Se cargaron automáticamente los gastos fijos del periodo anterior.`, 'info');
        return true;
    } catch (err) {
        console.error("Error en checkAndClonePfExpenses:", err);
        return false;
    } finally {
        isCloningPfExpenses = false;
    }
}

function renderPersonalFinances() {
    if (!personalFinancesContainer || personalFinancesContainer.classList.contains('hidden-element')) return;
    
    // Filtrar fijos y variables por periododo seleccionado
    const isAllMonths = pfFilterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(pfFilterMonth.value);
    const selYear = parseInt(pfFilterYear.value);
    
    // Si no es vista anual, verificar y precargar gastos si está vacio
    if (!isAllMonths && !isCloningPfExpenses) {
        checkAndClonePfExpenses(selYear, selMonth).then(wasCloned => {
            if (wasCloned) {
                renderPersonalFinances();
            }
        });
    }
    
    const filteredExpenses = personalExpenses.filter(e => {
        if (!e.fecha) return false;
        const [year, month] = e.fecha.split('-').map(Number);
        return year === selYear && (isAllMonths || (month - 1) === selMonth);
    });
    
    const fixedExpenses = filteredExpenses.filter(e => e.tipo === 'fijo');
    const variableExpenses = filteredExpenses.filter(e => e.tipo === 'variable');
    
    // Renderizar contadores
    if (pfFixedCount) pfFixedCount.textContent = `${fixedExpenses.length} ${fixedExpenses.length === 1 ? 'item' : 'items'}`;
    if (pfVariableCount) pfVariableCount.textContent = `${variableExpenses.length} ${variableExpenses.length === 1 ? 'item' : 'items'}`;
    
    // Calcular resumenes
    let totalPaid = 0;
    let totalPending = 0;
    
    filteredExpenses.forEach(e => {
        const amt = parseFloat(e.monto) || 0;
        if (e.estado === 'pagado') {
            totalPaid += amt;
        } else {
            totalPending += amt;
        }
    });
    
    // Obtener presupuesto/ingreso segun el filtro
    let currentIncome = 0;
    if (isAllMonths) {
        let annualSum = 0;
        Object.keys(personalIncomes).forEach(key => {
            if (key.startsWith(`${selYear}-`)) {
                annualSum += parseFloat(personalIncomes[key]) || 0;
            }
        });
        currentIncome = annualSum;
        
        if (pfMonthlyIncome) {
            pfMonthlyIncome.value = currentIncome > 0 ? currentIncome.toFixed(2) : '0.00';
            pfMonthlyIncome.disabled = true;
            pfMonthlyIncome.style.opacity = '0.7';
            pfMonthlyIncome.title = 'El ingreso anual es la suma de los ingresos mensuales individuales.';
        }
    } else {
        const monthStr = String(selMonth + 1).padStart(2, '0');
        const periodKey = `${selYear}-${monthStr}`;
        currentIncome = parseFloat(personalIncomes[periodKey]) || 0.00;
        
        if (pfMonthlyIncome) {
            pfMonthlyIncome.disabled = false;
            pfMonthlyIncome.style.opacity = '1';
            pfMonthlyIncome.title = '';
            if (document.activeElement !== pfMonthlyIncome) {
                pfMonthlyIncome.value = currentIncome > 0 ? currentIncome.toFixed(2) : '';
            }
        }
    }
    
    const balance = currentIncome - totalPaid;
    
    // Renderizar resumenes en las tarjetas
    if (pfTotalPaid) pfTotalPaid.textContent = formatCurrency(totalPaid).replace('RD$', 'RD$ ');
    if (pfTotalPending) pfTotalPending.textContent = formatCurrency(totalPending).replace('RD$', 'RD$ ');
    if (pfTotalBalance) {
        pfTotalBalance.textContent = formatCurrency(balance).replace('RD$', 'RD$ ');
        if (balance < 0) {
            pfTotalBalance.className = 'amount bold red-text';
        } else if (balance === 0) {
            pfTotalBalance.className = 'amount bold';
        } else {
            pfTotalBalance.className = 'amount bold blue-text';
        }
    }
    
    // Calcular porcentaje gastado (fijos + variables)
    const totalSpent = totalPaid + totalPending;
    let spentPct = 0;
    if (currentIncome > 0) {
        spentPct = (totalSpent / currentIncome) * 100;
    }
    
    // Determinar color din!mico de la barra
    let barColor = 'var(--income-color)'; // Verde < 70%
    if (spentPct >= 70 && spentPct <= 90) {
        barColor = '#f59e0b'; // Amarillo 70% - 90%
    } else if (spentPct > 90) {
        barColor = 'var(--expense-color)'; // Rojo > 90% o sobregirado
    }
    
    // Actualizar elementos de la barra de progreso
    const progressBar = document.getElementById('pf-budget-progress-bar');
    const progressPct = document.getElementById('pf-budget-progress-pct');
    const progressRem = document.getElementById('pf-budget-progress-rem');
    
    if (progressBar) {
        progressBar.style.width = `${Math.min(spentPct, 100)}%`;
        progressBar.style.backgroundColor = barColor;
    }
    if (progressPct) {
        progressPct.textContent = `${spentPct.toFixed(0)}% gastado`;
    }
    if (progressRem) {
        const remaining = currentIncome - totalSpent;
        if (remaining >= 0) {
            progressRem.textContent = `RD$ ${remaining.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} restante`;
            progressRem.style.color = 'var(--text-muted)';
        } else {
            progressRem.textContent = `RD$ ${Math.abs(remaining).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} sobregirado`;
            progressRem.style.color = 'var(--expense-color)';
        }
    }
    
    // Inyectar HTML en listas
    const renderList = (listEl, items) => {
        if (!listEl) return;
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No hay gastos registrados aqui.</p></div>';
            return;
        }
        
        listEl.innerHTML = items.map(item => {
            const isPaid = item.estado === 'pagado';
            
            // Buscar color de la categoria
            let catColor = '#6b7280'; // gris por defecto
            if (item.categoria) {
                const found = personalCategories.find(c => c.name.toLowerCase() === item.categoria.toLowerCase());
                if (found) catColor = found.color;
            }
            
            const catBadge = item.categoria 
                ? `<span style="background-color: ${catColor}15; color: ${catColor}; border: 1px solid ${catColor}30; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: 600; margin-left: 8px; display: inline-block;">${item.categoria}</span>`
                : '';
                
            return `
                <div class="pf-expense-item">
                    <div class="pf-item-left">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span class="pf-item-title">${item.concepto}</span>
                            ${catBadge}
                        </div>
                        <span class="pf-item-date">${formatDateString(item.fecha)}</span>
                    </div>
                    <div class="pf-item-right">
                        <span class="pf-item-amount">${formatCurrency(item.monto).replace('RD$', 'RD$ ')}</span>
                        <button class="btn-payment-state ${isPaid ? 'btn-state-paid' : 'btn-state-unpaid'}" data-id="${item.id}">
                            ${isPaid ? 'Pagado' : 'Pagar'}
                        </button>
                        ${activePersonalSpace.permissions.allowEdit ? `
                        <button class="btn-edit-item" data-id="${item.id}" title="Editar gasto">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>` : ''}
                        ${activePersonalSpace.permissions.allowDelete ? `
                        <button class="btn-delete-item" data-id="${item.id}" title="Eliminar gasto">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Agregar manejadores de eventos din!micos
        listEl.querySelectorAll('.btn-payment-state').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                togglePersonalExpenseState(id);
            });
        });
        
        listEl.querySelectorAll('.btn-edit-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                startEditPersonalExpense(id);
            });
        });
        
        listEl.querySelectorAll('.btn-delete-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                deletePersonalExpense(id);
            });
        });
    };
    
    renderList(pfFixedList, fixedExpenses);
    renderList(pfVariableList, variableExpenses);
    
    // Renderizar gr!ficos de Finanzas Personales
    renderPfCharts();
}

async function handlePfExpenseSubmit(e) {
    e.preventDefault();

    if (activePersonalSpace.permissions.isReadOnly || activePersonalSpace.permissions.allowAdd === false) {
        showToast('i Modo Solo Lectura: No tienes permiso para registrar gastos.', 'error');
        return;
    }

    const conceptVal = pfConcept.value.trim();
    const amountVal = parseFloat(pfAmount.value) || 0;
    const typeVal = pfType.value;
    const statusVal = pfStatus.value;
    const dateVal = pfDate ? pfDate.value : getTodayString();
    const categoryVal = pfCategory ? pfCategory.value.trim() : '';
    
    if (!dateVal) {
        showToast('Por favor, selecciona una fecha.', 'error');
        return;
    }
    if (!conceptVal) {
        showToast('Por favor, ingresa el concepto del gasto.', 'error');
        return;
    }
    if (amountVal <= 0) {
        showToast('El monto debe ser mayor a 0.', 'error');
        return;
    }
    
    if (editingPfExpenseId) {
        // Modo Edicion
        const idx = personalExpenses.findIndex(item => item.id === editingPfExpenseId);
        if (idx !== -1) {
            personalExpenses[idx].fecha = dateVal;
            personalExpenses[idx].concepto = conceptVal;
            personalExpenses[idx].monto = amountVal;
            personalExpenses[idx].tipo = typeVal;
            personalExpenses[idx].estado = statusVal;
            personalExpenses[idx].categoria = categoryVal;
            
            const expColRef = getPersonalCollectionRef();
            if (expColRef) {
                try {
                    await setDoc(doc(expColRef, editingPfExpenseId), sanitizeData(personalExpenses[idx]), { merge: true });
                } catch (e) {
                    console.error("Error actualizando gasto en subcolección:", e);
                }
            }
            
            await addAuditLog('personales', 'EDITAR', `Modificó gasto (${typeVal}) "${conceptVal}" por RD$ ${amountVal.toFixed(2)}`);
            showToast('Gasto personal actualizado con éxito.', 'success');
            
            cancelEditPersonalExpense();
        }
    } else {
        // Modo Registro Nuevo
        const newExpense = {
            id: 'pf-' + Date.now() + Math.random().toString(36).substr(2, 5),
            concepto: conceptVal,
            monto: amountVal,
            tipo: typeVal,
            estado: statusVal,
            fecha: dateVal,
            categoria: categoryVal,
            createdAt: new Date().toISOString()
        };
        
        personalExpenses.unshift(newExpense);
        
        const expColRef = getPersonalCollectionRef();
        if (expColRef) {
            try {
                await setDoc(doc(expColRef, newExpense.id), sanitizeData(newExpense));
            } catch (e) {
                console.error("Error guardando gasto en subcolección:", e);
            }
        }
        
        await addAuditLog('personales', 'CREAR', `Registró gasto (${typeVal}) "${conceptVal}" por RD$ ${amountVal.toFixed(2)}`);
        showToast('Gasto personal registrado con éxito.', 'success');
        
        // Resetear formulario
        pfConcept.value = '';
        pfAmount.value = '';
        pfType.value = 'fijo';
        pfStatus.value = 'pagar';
        if (pfCategory) pfCategory.value = '';
        if (pfDate) pfDate.value = getTodayString();
        userEditedPfCategory = false;
    }
    
    // Recargar filtros en base a los nuevos años registrados si aplica
    const now = new Date();
    populatePfYearFilter(now.getFullYear());
    
    renderPersonalFinances();
}

function startEditPersonalExpense(id) {
    const item = personalExpenses.find(x => x.id === id);
    if (!item) return;
    
    editingPfExpenseId = id;
    userEditedPfCategory = false;
    
    // Cargar datos en el formulario
    if (pfDate) pfDate.value = item.fecha;
    pfConcept.value = item.concepto;
    pfAmount.value = item.monto;
    pfType.value = item.tipo;
    pfStatus.value = item.estado;
    if (pfCategory) pfCategory.value = item.categoria || '';
    
    // Cambiar texto de boton submit
    if (pfSubmitText) pfSubmitText.textContent = 'Guardar';
    if (btnPfCancelEdit) btnPfCancelEdit.classList.remove('hidden-btn');
    
    // Cambiar icono de submit button a un disquete
    if (pfSubmitIconWrapper) {
        pfSubmitIconWrapper.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
            </svg>
        `;
    }
    
    // Scroll suave hacia arriba
    const formSection = document.querySelector('.pf-form-section');
    if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    showToast('Editando gasto...', 'info');
}

function cancelEditPersonalExpense() {
    editingPfExpenseId = null;
    userEditedPfCategory = false;
    
    // Restablecer formulario
    pfConcept.value = '';
    pfAmount.value = '';
    pfType.value = 'fijo';
    pfStatus.value = 'pagar';
    if (pfCategory) pfCategory.value = '';
    if (pfDate) pfDate.value = getTodayString();
    
    // Restablecer boton submit
    if (pfSubmitText) pfSubmitText.textContent = 'Agregar';
    if (btnPfCancelEdit) btnPfCancelEdit.classList.add('hidden-btn');
    
    if (pfSubmitIconWrapper) {
        pfSubmitIconWrapper.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        `;
    }
}

async function handlePfBudgetChange() {
    const isAllMonths = pfFilterMonth.value === 'all';
    if (isAllMonths) return; // No se puede editar en vista anual
    
    const selMonth = parseInt(pfFilterMonth.value);
    const selYear = parseInt(pfFilterYear.value);
    const monthStr = String(selMonth + 1).padStart(2, '0');
    const periodKey = `${selYear}-${monthStr}`;
    
    const val = parseFloat(pfMonthlyIncome.value) || 0;
    if (val > 0) {
        personalIncomes[periodKey] = val;
    } else {
        delete personalIncomes[periodKey];
    }
    
    await savePersonalFinancesMetadata();
    renderPersonalFinances();
}

async function togglePersonalExpenseState(id) {
    const expense = personalExpenses.find(e => e.id === id);
    if (expense) {
        expense.estado = expense.estado === 'pagado' ? 'pagar' : 'pagado';
        const msg = expense.estado === 'pagado' ? 'PAGADO' : 'PENDIENTE';
        
        const expColRef = getPersonalCollectionRef();
        if (expColRef) {
            try {
                await updateDoc(doc(expColRef, id), { estado: expense.estado });
            } catch (e) {
                console.error("Error actualizando estado en Firestore:", e);
            }
        }
        
        await addAuditLog('personales', 'EDITAR', `Marcó gasto "${expense.concepto}" como ${msg}`);
        renderPersonalFinances();
        showToast(expense.estado === 'pagado' ? 'Gasto marcado como PAGADO.' : 'Gasto marcado como PENDIENTE.', 'info');
    }
}

async function deletePersonalExpense(id) {
    const idx = personalExpenses.findIndex(e => e.id === id);
    if (idx !== -1) {
        const targetItem = personalExpenses[idx];
        personalExpenses.splice(idx, 1);
        
        const expColRef = getPersonalCollectionRef();
        if (expColRef) {
            try {
                await deleteDoc(doc(expColRef, id));
            } catch (e) {
                console.error("Error eliminando gasto en Firestore:", e);
            }
        }
        
        if (targetItem) {
            await addAuditLog('personales', 'ELIMINAR', `Eliminó gasto "${targetItem.concepto}" por RD$ ${parseFloat(targetItem.monto).toFixed(2)}`);
        }
        renderPersonalFinances();
        showToast('Gasto personal eliminado.', 'info');
    }
}

window.personalExpenses = personalExpenses;
window.transactions = transactions;
window.startEditPersonalExpense = startEditPersonalExpense;
window.cancelEditPersonalExpense = cancelEditPersonalExpense;
window.togglePersonalExpenseState = togglePersonalExpenseState;
window.deletePersonalExpense = deletePersonalExpense;
window.handlePfExpenseSubmit = handlePfExpenseSubmit;
window.addAuditLog = addAuditLog;

// --- ACCIONES FINANZAS PERSONALES: REPORTES Y RESPALDOS ---

function downloadPfReport() {
    const currentLang = getCurrentLangFromCookie();
    
    const translations = {
        es: {
            noExpensesRegistered: 'No hay gastos personales registrados para generar el reporte.',
            noExpensesPeriod: 'No hay gastos registrados en el periodo seleccionado.',
            reportTitle: 'Reporte de Finanzas Personales',
            subtitle: 'Control de gastos y presupuesto personal',
            period: 'Periodo',
            generated: 'Generado',
            budget: 'Ingreso / Presupuesto',
            totalPaid: 'Total Pagado',
            totalPending: 'Total Pendiente',
            availableBalance: 'Saldo Disponible',
            fixedExpenses: 'Gastos Fijos',
            variableExpenses: 'Gastos Variables / Imprevistos',
            date: 'Fecha',
            concept: 'Concepto',
            status: 'Estado',
            amount: 'Monto',
            paid: 'PAGADO',
            pending: 'PENDIENTE',
            noRecords: 'No hay registros en esta seccion',
            footer: 'Reporte de Finanzas Personales - Generado localmente y de forma privada por Income Manage.',
            months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        },
        en: {
            noExpensesRegistered: 'No personal expenses registered to generate report.',
            noExpensesPeriod: 'No expenses registered in the selected period.',
            reportTitle: 'Personal Finances Report',
            subtitle: 'Expense control and personal budget',
            period: 'Period',
            generated: 'Generated',
            budget: 'Income / Budget',
            totalPaid: 'Total Paid',
            totalPending: 'Total Pending',
            availableBalance: 'Available Balance',
            fixedExpenses: 'Fixed Expenses',
            variableExpenses: 'Variable / Unexpected Expenses',
            date: 'Date',
            concept: 'Concept',
            status: 'Status',
            amount: 'Amount',
            paid: 'PAID',
            pending: 'PENDING',
            noRecords: 'No records in this section',
            footer: 'Personal Finances Report - Generated locally and privately by Income Manage.',
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        },
        fr: {
            noExpensesRegistered: 'Aucune depense personnelle enregistree pour generer le rapport.',
            noExpensesPeriod: 'Aucune depense enregistree sur la periode selectionnee.',
            reportTitle: 'Rapport de Finances Personnelles',
            subtitle: 'Contrle des depenses et budget personnel',
            period: 'Periode',
            generated: 'Genere le',
            budget: 'Revenu / Budget',
            totalPaid: 'Total Paye',
            totalPending: 'Total En Attente',
            availableBalance: 'Solde Disponible',
            fixedExpenses: 'Depenses Fixes',
            variableExpenses: 'Depenses Variables / Imprevues',
            date: 'Date',
            concept: 'Concept',
            status: 'Statut',
            amount: 'Montant',
            paid: 'PAY',
            pending: 'EN ATTENTE',
            noRecords: 'Aucun enregistrement dans cette section',
            footer: 'Rapport de Finances Personnelles - Genere localement et en toute confidentialite par Income Manage.',
            months: ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
        },
        pt: {
            noExpensesRegistered: 'Nenhuma despesa pessoal registrada para gerar o relatorio.',
            noExpensesPeriod: 'Nenhuma despesa registrada no periodo selecionado.',
            reportTitle: 'Relatorio de Financas Pessoais',
            subtitle: 'Controle de despesas e orcamento pessoal',
            period: 'Periodo',
            generated: 'Gerado em',
            budget: 'Renda / Orcamento',
            totalPaid: 'Total Pago',
            totalPending: 'Total Pendente',
            availableBalance: 'Saldo Disponivel',
            fixedExpenses: 'Despesas Fixas',
            variableExpenses: 'Despesas Vari!veis / Imprevistas',
            date: 'Data',
            concept: 'Conceito',
            status: 'Status',
            amount: 'Valor',
            paid: 'PAGO',
            pending: 'PENDENTE',
            noRecords: 'Nenhum registro nesta secao',
            footer: 'Relatorio de Financas Pessoais - Gerado localmente e de forma privada por Income Manage.',
            months: ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
        },
        it: {
            noExpensesRegistered: 'Nessuna spesa personale registrata per generare il report.',
            noExpensesPeriod: 'Nessuna spesa registrata nel periodo selezionato.',
            reportTitle: 'Rapporto sulle Finanze Personali',
            subtitle: 'Controllo delle spese e bilancio personale',
            period: 'Periodo',
            generated: 'Generato il',
            budget: 'Entrate / Budget',
            totalPaid: 'Totale Pagato',
            totalPending: 'Totale In Sospeso',
            availableBalance: 'Saldo Disponibile',
            fixedExpenses: 'Spese Fisse',
            variableExpenses: 'Spese Variabili / Impreviste',
            date: 'Data',
            concept: 'Concetto',
            status: 'Stato',
            amount: 'Importo',
            paid: 'PAGATO',
            pending: 'IN ATTESA',
            noRecords: 'Nessun record in questa sezione',
            footer: 'Rapporto sulle Finanze Personali - Generato localmente e privatamente da Income Manage.',
            months: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
        },
        de: {
            noExpensesRegistered: 'Keine persnlichen Ausgaben registriert, um den Bericht zu erstellen.',
            noExpensesPeriod: 'Keine Ausgaben im ausgewahlten Zeitraum registriert.',
            reportTitle: 'Persnlicher Finanzbericht',
            subtitle: 'Ausgabenkontrolle und persnliches Budget',
            period: 'Zeitraum',
            generated: 'Erstellt am',
            budget: 'Einnahmen / Budget',
            totalPaid: 'Gesamt Bezahlt',
            totalPending: 'Gesamt Ausstehend',
            availableBalance: 'Verfugbares Guthaben',
            fixedExpenses: 'Fixkosten',
            variableExpenses: 'Variable / Unerwartete Ausgaben',
            date: 'Datum',
            concept: 'Konzept',
            status: 'Status',
            amount: 'Betrag',
            paid: 'BEZAHLT',
            pending: 'AUSSTEHEND',
            noRecords: 'Keine Eintrage in diesem Bereich',
            footer: 'Persnlicher Finanzbericht - Lokal und privat von Income Manage generiert.',
            months: ['Januar', 'Februar', 'Marz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
        }
    };
    
    const trans = translations[currentLang] || translations.es;

    if (personalExpenses.length === 0) {
        showToast(trans.noExpensesRegistered, 'error');
        return;
    }
    
    // Filtrar fijos y variables por periododo seleccionado
    const isAllMonths = pfFilterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(pfFilterMonth.value);
    const selYear = parseInt(pfFilterYear.value);
    
    const filteredExpenses = personalExpenses.filter(e => {
        if (!e.fecha) return false;
        const [year, month] = e.fecha.split('-').map(Number);
        return year === selYear && (isAllMonths || (month - 1) === selMonth);
    });
    
    if (filteredExpenses.length === 0) {
        showToast(trans.noExpensesPeriod, 'error');
        return;
    }
    
    const fixedExpenses = filteredExpenses.filter(e => e.tipo === 'fijo');
    const variableExpenses = filteredExpenses.filter(e => e.tipo === 'variable');
    
    let totalPaid = 0;
    let totalPending = 0;
    filteredExpenses.forEach(e => {
        const amt = parseFloat(e.monto) || 0;
        if (e.estado === 'pagado') totalPaid += amt;
        else totalPending += amt;
    });
    
    // Obtener presupuesto/ingreso segun el filtro
    let currentIncome = 0;
    if (isAllMonths) {
        let annualSum = 0;
        Object.keys(personalIncomes).forEach(key => {
            if (key.startsWith(`${selYear}-`)) {
                annualSum += parseFloat(personalIncomes[key]) || 0;
            }
        });
        currentIncome = annualSum;
    } else {
        const monthStr = String(selMonth + 1).padStart(2, '0');
        const periodKey = `${selYear}-${monthStr}`;
        currentIncome = parseFloat(personalIncomes[periodKey]) || 0.00;
    }
    
    const balance = currentIncome - totalPaid;
    
    const dateToday = getTodayString().split('-').reverse().join('/');
    
    const periodText = isAllMonths ? `${selYear}` : `${trans.months[selMonth]} ${selYear}`;
    
    // Generar las filas de las tablas
    const makeTableRows = (items) => {
        if (items.length === 0) {
            return `<tr><td colspan="4" style="text-align:center; color:#777777; padding:12px;">${trans.noRecords}</td></tr>`;
        }
        return items.map(item => `
            <tr>
                <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;">${formatDateString(item.fecha)}</td>
                <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;">${item.concepto}</td>
                <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;"><span class="print-badge" style="padding: 2px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: 600; text-transform: uppercase; border: 1px solid ${item.estado === 'pagado' ? '#ffbdad' : '#abf5d1'}; background-color: ${item.estado === 'pagado' ? '#ffebe6' : '#e3fcef'}; color: ${item.estado === 'pagado' ? '#bf2600' : '#006644'};">${item.estado === 'pagado' ? trans.paid : trans.pending}</span></td>
                <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt; text-align:right; font-weight:600; color: ${item.estado === 'pagado' ? '#bf2600' : '#f59e0b'};">
                    ${formatCurrency(item.monto).replace('RD$', 'RD$ ')}
                </td>
            </tr>
        `).join('');
    };

    let contentHTML = '';
    
    if (isAllMonths) {
        // Agrupar por mes
        const expensesByMonth = {};
        filteredExpenses.forEach(e => {
            const [year, month] = e.fecha.split('-').map(Number);
            const monthKey = month - 1; // 0-indexed
            if (!expensesByMonth[monthKey]) {
                expensesByMonth[monthKey] = [];
            }
            expensesByMonth[monthKey].push(e);
        });
        
        const sortedMonthKeys = Object.keys(expensesByMonth).map(Number).sort((a, b) => a - b);
        
        sortedMonthKeys.forEach(mKey => {
            const monthExpenses = expensesByMonth[mKey];
            const monthFixed = monthExpenses.filter(e => e.tipo === 'fijo');
            const monthVariable = monthExpenses.filter(e => e.tipo === 'variable');
            
            const fixedRows = makeTableRows(monthFixed);
            const variableRows = makeTableRows(monthVariable);
            
            contentHTML += `
                <div class="print-month-section" style="margin-top: 30px; page-break-inside: avoid;">
                    <h2 style="font-size: 14pt; font-weight: 700; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 5px; margin-bottom: 15px;">
                        ${trans.months[mKey]} ${selYear}
                    </h2>
                    
                    <div class="print-section-title" style="font-size: 11pt; font-weight: 600; margin-top: 10px; margin-bottom: 8px; color: #333333;">${trans.fixedExpenses}</div>
                    <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                        <thead>
                            <tr style="background-color: #f8f9fa;">
                                <th style="width: 15%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600;">${trans.date}</th>
                                <th style="width: 50%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600;">${trans.concept}</th>
                                <th style="width: 15%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600;">${trans.status}</th>
                                <th style="width: 20%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:right;">${trans.amount}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fixedRows}
                        </tbody>
                    </table>
                    
                    <div class="print-section-title" style="font-size: 11pt; font-weight: 600; margin-top: 10px; margin-bottom: 8px; color: #333333;">${trans.variableExpenses}</div>
                    <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                        <thead>
                            <tr style="background-color: #f8f9fa;">
                                <th style="width: 15%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600;">${trans.date}</th>
                                <th style="width: 50%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600;">${trans.concept}</th>
                                <th style="width: 15%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600;">${trans.status}</th>
                                <th style="width: 20%; padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:right;">${trans.amount}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${variableRows}
                        </tbody>
                    </table>
                </div>
            `;
        });
    } else {
        const fixedRows = makeTableRows(fixedExpenses);
        const variableRows = makeTableRows(variableExpenses);
        contentHTML = `
            <div class="print-section-title" style="font-size:13pt; font-weight:600; margin-top:25px; margin-bottom:10px; border-bottom:1px solid #dddddd; padding-bottom:5px;">${trans.fixedExpenses}</div>
            <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="width: 15%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600;">${trans.date}</th>
                        <th style="width: 50%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600;">${trans.concept}</th>
                        <th style="width: 15%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600;">${trans.status}</th>
                        <th style="width: 20%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600; text-align:right;">${trans.amount}</th>
                    </tr>
                </thead>
                <tbody>
                    ${fixedRows}
                </tbody>
            </table>
            
            <div class="print-section-title" style="font-size:13pt; font-weight:600; margin-top:25px; margin-bottom:10px; border-bottom:1px solid #dddddd; padding-bottom:5px;">${trans.variableExpenses}</div>
            <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="width: 15%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600;">${trans.date}</th>
                        <th style="width: 50%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600;">${trans.concept}</th>
                        <th style="width: 15%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600;">${trans.status}</th>
                        <th style="width: 20%; padding: 8px 10px; border-bottom: 1px solid #dddddd; font-size: 9pt; font-weight: 600; text-align:right;">${trans.amount}</th>
                    </tr>
                </thead>
                <tbody>
                    ${variableRows}
                </tbody>
            </table>
        `;
    }
    
    // Detectar si es dispositivo movil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                     || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
                     
    const reportHTML = `<!DOCTYPE html>
<html lang="${currentLang}" class="notranslate">
<head>
    <meta charset="UTF-8">
    <meta name="google" content="notranslate">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${trans.reportTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Poppins', system-ui, -apple-system, sans-serif;
            background-color: #ffffff;
            color: #000000;
            padding: 20px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .print-report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #000000;
            padding-bottom: 15px;
            margin-bottom: 25px;
        }
        .print-report-header h1 {
            font-size: 20pt;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .print-report-header p {
            font-size: 10pt;
            color: #555555;
        }
        .print-report-header-right {
            text-align: right;
            flex-shrink: 0;
        }
        .print-date {
            font-size: 12pt;
            font-weight: 600;
        }
        .print-subtitle {
            font-size: 9pt;
            color: #666666;
            margin-top: 4px;
        }
        .print-summary-grid {
            display: flex;
            justify-content: space-between;
            gap: 15px;
            margin-bottom: 30px;
        }
        .print-summary-card {
            flex: 1;
            border: 1px solid #dddddd;
            padding: 12px;
            border-radius: 6px;
            background-color: #fafafa !important;
        }
        .print-summary-card h3 {
            font-size: 9pt;
            color: #555555;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .print-summary-card .amount {
            font-size: 13pt;
            font-weight: 700;
        }
        .print-card-income .amount { color: #0052cc !important; }
        .print-card-expense .amount { color: #de350b !important; }
        .print-card-pending .amount { color: #f59e0b !important; }
        .print-card-balance .amount { color: #00875a !important; }
        
        .print-section-title {
            font-size: 13pt;
            font-weight: 600;
            margin-top: 25px;
            margin-bottom: 10px;
            border-bottom: 1px solid #dddddd;
            padding-bottom: 5px;
        }
        .print-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        .print-table th, .print-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #dddddd;
            font-size: 9pt;
            text-align: left;
        }
        .print-table th {
            font-weight: 600;
            background-color: #f0f0f0 !important;
        }
        .print-badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 7.5pt;
            font-weight: 600;
            text-transform: uppercase;
            border: 1px solid #cccccc;
        }
        .print-report-footer {
            border-top: 1px dashed #cccccc;
            padding-top: 15px;
            text-align: center;
            font-size: 8pt;
            color: #777777;
            margin-top: 30px;
        }
        /* Ocultar widgets y elementos de traduccion inyectados por el navegador */
        .skiptranslate,
        #google_translate_element,
        .goog-te-banner-frame,
        .goog-te-balloon-frame,
        .goog-te-balloon,
        .goog-tooltip,
        .goog-tooltip-responsive,
        #goog-gt-tt,
        iframe,
        iframe[class*="goog"],
        div[class*="goog"],
        [class*="translate-"],
        .translation- {
            display: none !important;
            height: 0 !important;
            width: 0 !important;
            visibility: hidden !important;
            opacity: 0 !important;
        }
    </style>
</head>
<body>
    <div class="print-report-header">
        <div>
            <h1>${trans.reportTitle}</h1>
            <p>${trans.subtitle}</p>
        </div>
        <div class="print-report-header-right">
            <div class="print-date">${isAllMonths ? periodText : `${trans.period}: ${periodText}`}</div>
            <div class="print-subtitle">${trans.generated}: ${dateToday}</div>
        </div>
    </div>
    
    <div class="print-summary-grid">
        <div class="print-summary-card print-card-income">
            <h3>${trans.budget}</h3>
            <div class="amount">RD$ ${currentIncome.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
        </div>
        <div class="print-summary-card print-card-expense">
            <h3>${trans.totalPaid}</h3>
            <div class="amount">RD$ ${totalPaid.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
        </div>
        <div class="print-summary-card print-card-pending">
            <h3>${trans.totalPending}</h3>
            <div class="amount">RD$ ${totalPending.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
        </div>
        <div class="print-summary-card print-card-balance">
            <h3>${trans.availableBalance}</h3>
            <div class="amount">RD$ ${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
        </div>
    </div>
    
    ${contentHTML}
    
    <div class="print-report-footer">
        ${trans.footer}
    </div>
    
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
        }
    </script>
</body>
</html>`;

    if (isMobile) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(reportHTML);
            printWindow.document.close();
        } else {
            showToast('El navegador bloqueo la ventana emergente de impresion.', 'error');
        }
    } else {
        const printReportContainer = document.getElementById('print-report-container');
        if (printReportContainer) {
            printReportContainer.innerHTML = `
                <div class="print-report-wrapper">
                    <div class="print-report-header">
                        <div>
                            <h1>${trans.reportTitle}</h1>
                            <p>${trans.subtitle}</p>
                        </div>
                        <div class="print-report-header-right">
                            <div class="print-date">${isAllMonths ? periodText : `${trans.period}: ${periodText}`}</div>
                            <div class="print-subtitle">${trans.generated}: ${dateToday}</div>
                        </div>
                    </div>
                    
                    <div class="print-summary-grid" style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 30px;">
                        <div class="print-summary-card print-card-income" style="flex:1; border: 1px solid #dddddd; padding: 12px; border-radius: 6px; background-color: #fafafa;">
                            <h3 style="font-size: 9pt; color: #555555; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">${trans.budget}</h3>
                            <div class="amount" style="font-size: 13pt; font-weight: 700; color: #0052cc;">RD$ ${currentIncome.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
                        </div>
                        <div class="print-summary-card print-card-expense" style="flex:1; border: 1px solid #dddddd; padding: 12px; border-radius: 6px; background-color: #fafafa;">
                            <h3 style="font-size: 9pt; color: #555555; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">${trans.totalPaid}</h3>
                            <div class="amount" style="font-size: 13pt; font-weight: 700; color: #de350b;">RD$ ${totalPaid.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
                        </div>
                        <div class="print-summary-card print-card-pending" style="flex:1; border: 1px solid #dddddd; padding: 12px; border-radius: 6px; background-color: #fafafa;">
                            <h3 style="font-size: 9pt; color: #555555; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">${trans.totalPending}</h3>
                            <div class="amount" style="font-size: 13pt; font-weight: 700; color: #f59e0b;">RD$ ${totalPending.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
                        </div>
                        <div class="print-summary-card print-card-balance" style="flex:1; border: 1px solid #dddddd; padding: 12px; border-radius: 6px; background-color: #fafafa;">
                            <h3 style="font-size: 9pt; color: #555555; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">${trans.availableBalance}</h3>
                            <div class="amount" style="font-size: 13pt; font-weight: 700; color: #00875a;">RD$ ${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</div>
                        </div>
                    </div>
                    
                    ${contentHTML}
                    
                    <div class="print-report-footer" style="border-top:1px dashed #cccccc; padding-top:15px; text-align:center; font-size:8pt; color:#777777; margin-top:30px;">
                        ${trans.footer}
                    </div>
                </div>
            `;
            window.print();
        }
    }
}

function exportPfBackup() {
    if (personalExpenses.length === 0 && Object.keys(personalIncomes).length === 0) {
        showToast('No hay datos de finanzas personales que respaldar.', 'error');
        return;
    }
    
    let csvContent = '\uFEFF'; // BOM para soporte de caracteres en Excel
    
    // Exportar presupuestos mensuales
    Object.keys(personalIncomes).forEach(key => {
        csvContent += `METADATA_PRESUPUESTO_MENSUAL,${key},${personalIncomes[key]}\r\n`;
    });
    
    csvContent += 'id,fecha,concepto,monto,tipo,estado,categoria\r\n';
    
    // De m!s antiguo a m!s reciente
    const sorted = [...personalExpenses].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    sorted.forEach(e => {
        const row = [
            e.id,
            e.fecha,
            escapeCSVField(e.concepto),
            e.monto,
            e.tipo,
            e.estado,
            escapeCSVField(e.categoria || '')
        ];
        csvContent += row.join(',') + '\r\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateToday = getTodayString();
    
    link.setAttribute('href', url);
    link.setAttribute('download', `respaldo-finanzas-personales-${dateToday}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Respaldo de finanzas personales exportado con exito.', 'success');
}

function handleImportPfCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
        showToast('El archivo seleccionado debe ser de formato CSV.', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        parseAndValidatePfCsv(text);
    };
    reader.onerror = function() {
        showToast('Error al leer el archivo seleccionado.', 'error');
    };
    reader.readAsText(file, 'UTF-8');
}

function parseAndValidatePfCsv(content) {
    parsedPfExpensesToImport = [];
    parsedPfIncomesToImport = {};
    
    const lines = content.split(/\r?\n/);
    if (lines.length < 2) {
        showToast('El archivo CSV est! vacio o incompleto.', 'error');
        return;
    }
    
    let errorCount = 0;
    let validCount = 0;
    let startIdx = 0;
    
    // Analizar metadata del presupuesto (pueden ser multiples lineas de presupuesto mensual)
    while (startIdx < lines.length) {
        const lineClean = lines[startIdx].replace(/^\uFEFF/, '').trim();
        if (lineClean.startsWith('METADATA_PRESUPUESTO_MENSUAL,')) {
            const parts = lineClean.split(',');
            const mKey = parts[1];
            const mVal = parseFloat(parts[2]) || 0.00;
            parsedPfIncomesToImport[mKey] = mVal;
            startIdx++;
        } else if (lineClean.startsWith('METADATA_PRESUPUESTO,')) {
            // Compatibilidad legacy: asignar presupuesto unico al mes actual
            const parts = lineClean.split(',');
            const mVal = parseFloat(parts[1]) || 0.00;
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            parsedPfIncomesToImport[currentMonthKey] = mVal;
            startIdx++;
        } else {
            break;
        }
    }
    
    // Analizar encabezado
    if (lines.length <= startIdx) {
        showToast('El archivo no contiene filas de datos.', 'error');
        return;
    }
    
    const headerLine = lines[startIdx].trim().toLowerCase();
    const headers = headerLine.split(',');
    
    // Aceptar CSV con 6 columnas (legacy sin categoria) o 7 columnas (con categoria)
    const isLegacy6Col = headers.length === 6 && headers[0] === 'id' && headers[1] === 'fecha' && headers[2] === 'concepto' && headers[3] === 'monto' && headers[4] === 'tipo' && headers[5] === 'estado';
    const isNew7Col = headers.length === 7 && headers[0] === 'id' && headers[1] === 'fecha' && headers[2] === 'concepto' && headers[3] === 'monto' && headers[4] === 'tipo' && headers[5] === 'estado' && headers[6] === 'categoria';
    
    if (!isLegacy6Col && !isNew7Col) {
        showToast('Formato de CSV de finanzas personales inv!lido.', 'error');
        return;
    }
    
    const expectedCols = isNew7Col ? 7 : 6;
    
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = splitCsvLine(line);
        if (row.length < 6 || row.length > 7) {
            errorCount++;
            continue;
        }
        
        const [id, fecha, concepto, montoRaw, tipo, estado] = row.map(s => s.trim());
        const categoria = row.length >= 7 ? row[6].trim() : '';
        const monto = parseFloat(montoRaw);
        const tipoNorm = tipo.toLowerCase();
        const estadoNorm = estado.toLowerCase();
        
        const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
        const isConceptValid = concepto.length > 0;
        const isTypeValid = tipoNorm === 'fijo' || tipoNorm === 'variable';
        const isStatusValid = estadoNorm === 'pagar' || estadoNorm === 'pagado';
        const isAmountValid = !isNaN(monto) && monto > 0;
        
        if (isDateValid && isConceptValid && isTypeValid && isStatusValid && isAmountValid) {
            parsedPfExpensesToImport.push({
                id: id || ('pf-' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fecha: fecha,
                concepto: concepto,
                monto: monto,
                tipo: tipoNorm,
                estado: estadoNorm,
                categoria: categoria
            });
            validCount++;
        } else {
            errorCount++;
        }
    }
    
    if (validCount === 0 && Object.keys(parsedPfIncomesToImport).length === 0) {
        showToast('No se encontraron registros de finanzas personales v!lidos.', 'error');
        return;
    }
    
    // Preparar mensaje modal
    let statsMessage = `Se encontraron: <br>
                        - <strong>${Object.keys(parsedPfIncomesToImport).length}</strong> registros de presupuesto mensual.<br>
                        - <strong>${parsedPfExpensesToImport.filter(x => x.tipo === 'fijo').length}</strong> gastos fijos.<br>
                        - <strong>${parsedPfExpensesToImport.filter(x => x.tipo === 'variable').length}</strong> gastos variables.`;
                        
    if (errorCount > 0) {
        statsMessage += `<br><span style="color: var(--expense-color);">Se omitieron <strong>${errorCount}</strong> filas debido a errores de formato.</span>`;
    }
    statsMessage += `<br><br>?Est!s seguro de que deseas proceder? Los gastos actuales ser!n reemplazados por completo.`;
    
    if (pfImportStatsText) {
        pfImportStatsText.innerHTML = statsMessage;
    }
    openModal(modalPfImport);
}

async function executePfImport() {
    personalExpenses = parsedPfExpensesToImport;
    personalIncomes = parsedPfIncomesToImport;
    
    // Guardar en Firestore subcolección en lotes
    const expColRef = getPersonalCollectionRef();
    if (expColRef) {
        try {
            for (let i = 0; i < personalExpenses.length; i += 400) {
                const batch = writeBatch(db);
                const chunk = personalExpenses.slice(i, i + 400);
                chunk.forEach(e => {
                    const docRef = doc(expColRef, e.id);
                    batch.set(docRef, sanitizeData(e), { merge: true });
                });
                await batch.commit();
            }
        } catch (err) {
            console.error("Error importando lote a subcolección de gastos personales:", err);
        }
    }
    
    await savePersonalFinancesMetadata();
    renderPersonalFinances();
    
    closeModal(modalPfImport);
    showToast('Respaldo de finanzas personales importado con éxito.', 'success');
}

async function executePfClearData() {
    const expColRef = getPersonalCollectionRef();
    if (expColRef) {
        try {
            const snap = await getDocs(expColRef);
            for (let i = 0; i < snap.docs.length; i += 400) {
                const batch = writeBatch(db);
                const chunk = snap.docs.slice(i, i + 400);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        } catch (e) {
            console.error("Error limpiando subcolección de gastos personales:", e);
        }
    }
    
    personalExpenses = [];
    personalIncomes = {};
    
    await savePersonalFinancesMetadata();
    
    if (pfMonthlyIncome) {
        pfMonthlyIncome.value = '';
    }
    renderPersonalFinances();
    
    closeModal(modalPfClear);
    showToast('Todos los datos de finanzas personales han sido eliminados.', 'info');
}


// --- EVENT LISTENERS ---

function setupEventListeners() {
    // Cambio de tema
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Filtros de fecha
    if (filterMonth) filterMonth.addEventListener('change', render);
    if (filterYear) filterYear.addEventListener('change', render);
    
    // Autocompletado y validaciones en el Formulario
    if (inputConcept) {
        inputConcept.addEventListener('input', handleConceptInput);
        inputConcept.addEventListener('focus', handleConceptInput);
    }
    if (inputCategory) {
        inputCategory.addEventListener('input', () => {
            userEditedCategory = true;
        });
    }
    
    // Cerrar lista de autocompletado si se hace clic fuera
    document.addEventListener('click', (e) => {
        if (typeof inputConcept !== 'undefined' && inputConcept && typeof autocompleteList !== 'undefined' && autocompleteList && e.target !== inputConcept && e.target !== autocompleteList) {
            closeAutocomplete();
        }
        if (typeof pfConcept !== 'undefined' && pfConcept && typeof pfAutocompleteList !== 'undefined' && pfAutocompleteList && e.target !== pfConcept && e.target !== pfAutocompleteList) {
            closePfAutocomplete();
        }
    });
    
    // Envio del formulario
    if (transactionForm) transactionForm.addEventListener('submit', handleFormSubmit);
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', cancelEdit);
    
    // Boton para simular clic en input file para importar CSV
    if (btnImportTrigger) {
        btnImportTrigger.addEventListener('click', () => {
            if (csvFileInput) {
                csvFileInput.value = ''; // Resetear
                csvFileInput.click();
            }
        });
    }
    if (csvFileInput) csvFileInput.addEventListener('change', handleImportCsvFile);
    
    // Botones de acciones generales
    if (btnMonthlyReport) btnMonthlyReport.addEventListener('click', downloadMonthlyReport);
    if (btnExportBackup) btnExportBackup.addEventListener('click', downloadFullBackup);
    if (btnClearData) btnClearData.addEventListener('click', () => openModal(modalClear));
    
    // Botones del modal de eliminar
    if (btnDeleteCancel) btnDeleteCancel.addEventListener('click', () => closeModal(modalDelete));
    if (btnDeleteConfirm) btnDeleteConfirm.addEventListener('click', confirmDeleteTransaction);
    
    // Botones del modal de importacion
    if (btnImportCancel) {
        btnImportCancel.addEventListener('click', () => {
            closeModal(modalImport);
            parsedCsvTransactionsToImport = [];
        });
    }
    if (btnImportConfirm) btnImportConfirm.addEventListener('click', executeImportCsv);
    
    // Botones del modal de limpiar
    if (btnClearCancel) btnClearCancel.addEventListener('click', () => closeModal(modalClear));
    if (btnClearConfirm) btnClearConfirm.addEventListener('click', executeClearData);
    
    // Habilitar cierre de modales con la 'X' superior y los botones 'Cerrar' al pie
    document.querySelectorAll('.modal-close-btn, #btn-mmp-close, #btn-logs-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal);
        });
    });
    
    // Autenticacion con Google
    if (btnLoginGoogle) {
        const defaultGoogleBtnHtml = `
            <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Iniciar sesión con Google
        `;

        btnLoginGoogle.addEventListener('click', async () => {
            const errBox = document.getElementById('login-error-box');
            if (errBox) errBox.style.display = 'none';

            btnLoginGoogle.disabled = true;
            btnLoginGoogle.style.opacity = '0.75';
            btnLoginGoogle.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 8px;">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
                </svg>
                Conectando con Google...
            `;

            try {
                // Intentar primero con popup (más rápido, sin recarga de página)
                await signInWithPopup(auth, googleProvider);
            } catch (popupError) {
                console.warn("Popup falló:", popupError.code, popupError.message);

                if (popupError.code === 'auth/popup-closed-by-user' || popupError.code === 'auth/cancelled-popup-request') {
                    // Usuario cerró la ventana voluntariamente — no es un error
                    btnLoginGoogle.disabled = false;
                    btnLoginGoogle.style.opacity = '1';
                    btnLoginGoogle.innerHTML = defaultGoogleBtnHtml;
                    return;
                }

                if (popupError.code === 'auth/unauthorized-domain') {
                    const msg = 'Dominio no autorizado: "' + window.location.hostname + '".\nVe a Firebase Console > Authentication > Settings > Authorized domains y agrega este dominio exacto.';
                    if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; }
                    alert(msg);
                    btnLoginGoogle.disabled = false;
                    btnLoginGoogle.style.opacity = '1';
                    btnLoginGoogle.innerHTML = defaultGoogleBtnHtml;
                    return;
                }

                // Popup bloqueado (Brave, Safari, etc.) — intentar con redirección
                console.warn("Intentando con redirección como alternativa...");
                btnLoginGoogle.innerHTML = `
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 8px;">
                        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
                    </svg>
                    Redirigiendo a Google...
                `;
                try {
                    await signInWithRedirect(auth, googleProvider);
                } catch (redirectError) {
                    console.error("Error en redirección:", redirectError.code, redirectError.message);
                    const msg = 'Error al conectar con Google: ' + (redirectError.code || redirectError.message || 'Error desconocido');
                    if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; }
                    alert(msg);
                    btnLoginGoogle.disabled = false;
                    btnLoginGoogle.style.opacity = '1';
                    btnLoginGoogle.innerHTML = defaultGoogleBtnHtml;
                }
            }
        });
    }
    
    // Cerrar sesion
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await signOut(auth);
                showToast('Sesion cerrada correctamente.', 'info');
            } catch (error) {
                console.error("Error al cerrar sesion: ", error);
                showToast('Error al cerrar sesion.', 'error');
            }
        });
    }
    
    if (userProfile) {
        userProfile.addEventListener('click', async () => {
            // Si estamos en pantalla pequena (movil) donde el boton logout est! oculto,
            // permitimos cerrar sesion al tocar la foto de perfil (previo di!logo de confirmacion)
            if (window.innerWidth <= 600) {
                if (confirm('?Deseas cerrar sesion?')) {
                    try {
                        await signOut(auth);
                        showToast('Sesion cerrada correctamente.', 'info');
                    } catch (error) {
                        console.error("Error al cerrar sesion: ", error);
                        showToast('Error al cerrar sesion.', 'error');
                    }
                }
            }
        });
    }
    
    // Navegacion de modulos con Passphrase y Espacios
    if (btnGotoTesoreria) {
        btnGotoTesoreria.addEventListener('click', () => {
            openPassphraseModal('tesoreria');
        });
    }
    if (btnGotoPersonales) {
        btnGotoPersonales.addEventListener('click', () => {
            openPassphraseModal('personales');
        });
    }
    if (btnBackToMenu) {
        btnBackToMenu.addEventListener('click', () => showModule('menu'));
    }
    if (headerLogo) {
        headerLogo.addEventListener('click', () => {
            if (currentUser) {
                showModule('menu');
            }
        });
    }

    // Botones de Espacios y Passphrases
    const btnTSwitchSpace = document.getElementById('btn-t-switch-space');
    if (btnTSwitchSpace) {
        btnTSwitchSpace.addEventListener('click', () => openPassphraseModal('tesoreria', true));
    }

    const btnPfSwitchSpace = document.getElementById('btn-pf-switch-space');
    if (btnPfSwitchSpace) {
        btnPfSwitchSpace.addEventListener('click', () => openPassphraseModal('personales', true));
    }

    const btnConfigPassphrase = document.getElementById('btn-config-passphrase');
    if (btnConfigPassphrase) {
        btnConfigPassphrase.addEventListener('click', () => openManagePassphraseModal('tesoreria'));
    }

    const btnPfConfigPassphrase = document.getElementById('btn-pf-config-passphrase');
    if (btnPfConfigPassphrase) {
        btnPfConfigPassphrase.addEventListener('click', () => openManagePassphraseModal('personales'));
    }

    const btnActivityLogs = document.getElementById('btn-activity-logs');
    if (btnActivityLogs) {
        btnActivityLogs.addEventListener('click', () => openActivityLogsModal('tesoreria'));
    }

    const btnPfActivityLogs = document.getElementById('btn-pf-activity-logs');
    if (btnPfActivityLogs) {
        btnPfActivityLogs.addEventListener('click', () => openActivityLogsModal('personales'));
    }

    // Formulario de Ingreso de Passphrase
    const formEnterPassphrase = document.getElementById('form-enter-passphrase');
    if (formEnterPassphrase) {
        formEnterPassphrase.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputPass = document.getElementById('passphrase-input');
            const passVal = inputPass ? inputPass.value.trim() : '';

            if (!passVal) {
                showToast('Por favor introduce una frase de acceso (Passphrase) v!lida.', 'warning');
                return;
            }

            const targetModule = currentPassphraseModalModule || 'tesoreria';

            try {
                const hash = await hashPassphrase(targetModule, passVal);

                // Validar si el espacio realmente existe en Firestore antes de permitir el acceso
                let name = 'Espacio Compartido';
                let spaceData = null;
                if (db) {
                    try {
                        const collectionName = targetModule === 'tesoreria' ? 'shared_tesoreria' : 'shared_personales';
                        const spaceDocRef = doc(db, collectionName, hash);
                        const docSnap = await getDoc(spaceDocRef);
                        
                        if (!docSnap || !docSnap.exists()) {
                            showToast('La Passphrase es incorrecta o el espacio aún no ha sido compartido.', 'error');
                            return; // Bloquea la conexion y creacion de espacio fantasma
                        }

                        spaceData = docSnap.data();
                        if (spaceData && spaceData.spaceName) {
                            name = spaceData.spaceName;
                        }
                    } catch (fetchErr) {
                        console.error("Error al validar el espacio:", fetchErr);
                        showToast('Error al conectar con la nube: ' + (fetchErr.message || 'Sin permisos o error de red'), 'error');
                        return;
                    }
                }

                const effectiveUser = currentUser || auth.currentUser;
                const isOwner = spaceData ? (
                    (spaceData.ownerUid && effectiveUser && spaceData.ownerUid === effectiveUser.uid) ||
                    (spaceData.ownerEmail && effectiveUser && effectiveUser.email && spaceData.ownerEmail.toLowerCase() === effectiveUser.email.toLowerCase())
                ) : false;

                // Registrar al usuario en los miembros del espacio compartido en Firestore
                if (!isOwner && effectiveUser && db) {
                    try {
                        const collectionName = targetModule === 'tesoreria' ? 'shared_tesoreria' : 'shared_personales';
                        const spaceDocRef = doc(db, collectionName, hash);
                        const memberObj = {
                            email: effectiveUser.email || 'invitado@gmail.com',
                            displayName: effectiveUser.displayName || (effectiveUser.email ? effectiveUser.email.split('@')[0] : 'Invitado'),
                            joinedAt: new Date().toISOString(),
                            isBlocked: false,
                            permissions: { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false }
                        };
                        await setDoc(spaceDocRef, {
                            members: {
                                [effectiveUser.uid]: memberObj
                            }
                        }, { merge: true });
                    } catch (regErr) {
                        console.warn("Aviso al registrar miembro en Firestore:", regErr);
                    }
                }

                // Guardar en la lista de accesos guardados del usuario
                const savedList = userSavedWorkspaces[targetModule] || [];
                const existingIdx = savedList.findIndex(w => w.hash === hash);
                const wsEntry = { hash, passphrase: passVal, name, isOwner };
                if (existingIdx >= 0) {
                    savedList[existingIdx] = { ...savedList[existingIdx], ...wsEntry };
                } else {
                    savedList.push(wsEntry);
                }
                userSavedWorkspaces[targetModule] = savedList;

                try {
                    await saveSavedWorkspacesToUser();
                } catch (saveErr) {
                    console.warn("No se pudo guardar la lista de espacios en el usuario:", saveErr);
                }

                // Activar el espacio y suscribirse en tiempo real
                if (targetModule === 'tesoreria') {
                    if (treasuryUnsubscribe) { treasuryUnsubscribe(); treasuryUnsubscribe = null; }
                    activeTreasurySpace = {
                        passphrase: passVal,
                        hash,
                        spaceName: name,
                        isOwner: isOwner,
                        permissions: isOwner ? { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false } : { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false },
                        isBlocked: false,
                        members: {},
                        logs: []
                    };
                    await setupSpaceListener('tesoreria');
                    updateSpaceBadgeUI('tesoreria');
                    updateModulePermissionUI('tesoreria');
                    render();
                } else {
                    if (personalUnsubscribe) { personalUnsubscribe(); personalUnsubscribe = null; }
                    activePersonalSpace = {
                        passphrase: passVal,
                        hash,
                        spaceName: name,
                        isOwner: isOwner,
                        permissions: isOwner ? { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false } : { allowAdd: true, allowEdit: false, allowDelete: false, isReadOnly: false },
                        isBlocked: false,
                        members: {},
                        logs: []
                    };
                    await setupSpaceListener('personales');
                    updateSpaceBadgeUI('personales');
                    updateModulePermissionUI('personales');
                    renderPersonalFinances();
                }

                if (inputPass) inputPass.value = '';
                closePassphraseModal();
                showModule(targetModule);
                showToast(`Conectado exitosamente al espacio '${name}'`, 'success');
            } catch (err) {
                console.error("Error al acceder con passphrase:", err);
                showToast('Ocurrió un error al procesar la frase de acceso. Intenta de nuevo.', 'error');
            }
        });
    }

    // Boton Volver a Espacio Local desde Modal de Cambiar Espacio
    const btnReturnLocal = document.getElementById('btn-return-local-space');
    if (btnReturnLocal) {
        btnReturnLocal.addEventListener('click', async () => {
            await disconnectActiveSpace(currentPassphraseModalModule);
            closePassphraseModal();
            showModule(currentPassphraseModalModule);
        });
    }

    // Boton Continuar a Cuenta Personal / Cerrar Modal
    const btnPassphraseSkip = document.getElementById('btn-passphrase-skip');
    if (btnPassphraseSkip) {
        btnPassphraseSkip.addEventListener('click', async () => {
            if (currentPassphraseIsSwitching) {
                closePassphraseModal();
                return;
            }

            if (currentPassphraseModalModule === 'tesoreria') {
                if (treasuryUnsubscribe) { treasuryUnsubscribe(); treasuryUnsubscribe = null; }
                transactions = [];
                activeTreasurySpace = {
                    passphrase: '',
                    hash: '',
                    spaceName: 'Cuenta Personal',
                    isOwner: true,
                    permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
                    isBlocked: false,
                    members: {},
                    logs: []
                };
                await setupSpaceListener('tesoreria');
                updateSpaceBadgeUI('tesoreria');
                updateModulePermissionUI('tesoreria');
                render();
            } else {
                if (personalUnsubscribe) { personalUnsubscribe(); personalUnsubscribe = null; }
                personalExpenses = [];
                personalIncomes = {};
                activePersonalSpace = {
                    passphrase: '',
                    hash: '',
                    spaceName: 'Cuenta Personal',
                    isOwner: true,
                    permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
                    isBlocked: false,
                    members: {},
                    logs: []
                };
                await setupSpaceListener('personales');
                updateSpaceBadgeUI('personales');
                updateModulePermissionUI('personales');
                renderPersonalFinances();
            }
            closePassphraseModal();
            showModule(currentPassphraseModalModule);
        });
    }

    // Alternar visibilidad de contrasena
    const btnTogglePassVis = document.getElementById('btn-toggle-passphrase-vis');
    if (btnTogglePassVis) {
        btnTogglePassVis.addEventListener('click', () => {
            const inputPass = document.getElementById('passphrase-input');
            if (inputPass) {
                inputPass.type = inputPass.type === 'password' ? 'text' : 'password';
            }
        });
    }

    // Manejadores de pestanas en modal de gestion de espacio
    const mmpTabEdit = document.getElementById('mmp-tab-edit');
    const mmpTabMembers = document.getElementById('mmp-tab-members');
    const mmpTabCreate = document.getElementById('mmp-tab-create');
    const btnMmpRefreshMembers = document.getElementById('btn-mmp-refresh-members');

    if (mmpTabEdit) mmpTabEdit.addEventListener('click', () => setMmpMode('edit'));
    if (mmpTabMembers) mmpTabMembers.addEventListener('click', () => setMmpMode('members'));
    if (mmpTabCreate) mmpTabCreate.addEventListener('click', () => setMmpMode('create'));
    if (btnMmpRefreshMembers) {
        btnMmpRefreshMembers.addEventListener('click', async () => {
            btnMmpRefreshMembers.textContent = '⌛ Cargando...';
            await openManagePassphraseModal(currentManagePassphraseModule);
            setMmpMode('members');
            btnMmpRefreshMembers.textContent = '🔄 Actualizar';
            showToast('Lista de integrantes actualizada.', 'info');
        });
    }

    // Formulario de Configuracion / Creacion de Espacio
    const mmpSpaceForm = document.getElementById('mmp-space-form');
    if (mmpSpaceForm) {
        mmpSpaceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newNameEl = document.getElementById('mmp-space-name-input');
            const newPassEl = document.getElementById('mmp-passphrase-input');
            const newName = newNameEl ? newNameEl.value.trim() : '';
            const newPass = newPassEl ? newPassEl.value.trim() : '';

            if (!newName) {
                showToast('Por favor ingrese un nombre para el espacio.', 'error');
                return;
            }

            const isTreasury = currentManagePassphraseModule === 'tesoreria';
            const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;

            // Helper para limpiar valores undefined antes de guardar en Firestore
            const sanitizeData = (data) => JSON.parse(JSON.stringify(data, (key, value) => value === undefined ? null : value));

            try {
                if (currentMmpMode === 'create') {
                    if (!newPass) {
                        showToast('Por favor ingrese una frase de acceso (Passphrase) para el nuevo espacio.', 'error');
                        return;
                    }
                    const hash = await hashPassphrase(currentManagePassphraseModule, newPass);
                    const copyCheck = document.getElementById('mmp-copy-local-check');
                    const shouldCopy = copyCheck ? copyCheck.checked : false;

                    const effectiveUser = currentUser || auth.currentUser;
                    const safeEmail = (effectiveUser && effectiveUser.email) ? effectiveUser.email : '';
                    const safeDisplayName = (effectiveUser && effectiveUser.displayName) ? effectiveUser.displayName : (safeEmail ? safeEmail.split('@')[0] : 'Usuario');
                    const currentUid = (effectiveUser && effectiveUser.uid) ? effectiveUser.uid : 'local_user';

                    const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
                    const sharedDocRef = (effectiveUser && db) ? doc(db, collectionName, hash) : null;

                    // Si existe el documento en Firestore, verificar si pertenece a otro usuario
                    if (sharedDocRef) {
                        try {
                            const existingDocSnap = await getDoc(sharedDocRef);
                            if (existingDocSnap && existingDocSnap.exists()) {
                                const existingData = existingDocSnap.data();
                                const isOtherOwner = existingData.ownerUid && existingData.ownerUid !== currentUid && (!existingData.ownerEmail || existingData.ownerEmail.toLowerCase() !== safeEmail.toLowerCase());
                                if (isOtherOwner) {
                                    showToast('Esta frase de acceso (Passphrase) ya está en uso por otro usuario. Si deseas unirte, usa la opción "Acceder a Espacio".', 'error');
                                    return;
                                }
                            }
                        } catch (checkErr) {
                            console.warn("Aviso al verificar existencia del espacio:", checkErr);
                        }
                    }

                    const initialData = {
                        spaceName: newName,
                        ownerUid: currentUid,
                        ownerEmail: safeEmail,
                        pendingOwnerTransfer: false,
                        updatedAt: new Date().toISOString(),
                        members: {
                            [currentUid]: {
                                email: safeEmail,
                                displayName: safeDisplayName,
                                joinedAt: new Date().toISOString(),
                                isBlocked: false,
                                permissions: { allowEdit: true, allowDelete: true }
                            }
                        },
                        logs: [{
                            id: Date.now().toString(),
                            timestamp: new Date().toLocaleString(),
                            userEmail: safeEmail || 'Usuario',
                            action: 'CREAR',
                            details: shouldCopy ? 'Creó el espacio compartido importando datos locales' : 'Creó el espacio compartido en blanco'
                        }]
                    };

                    if (isTreasury) {
                        const txData = shouldCopy && Array.isArray(transactions) ? sanitizeData(transactions) : [];
                        const catData = shouldCopy && Array.isArray(treasuryCategories) ? sanitizeData(treasuryCategories) : [...DEFAULT_TREASURY_CATEGORIES];
                        initialData.transactions = txData;
                        initialData.treasuryCategories = catData;
                        
                        if (sharedDocRef) {
                            try {
                                await setDoc(sharedDocRef, sanitizeData(initialData), { merge: true });
                            } catch (cloudErr) {
                                console.warn("Aviso al sincronizar en shared_tesoreria:", cloudErr);
                            }
                        }
                        
                        if (treasuryUnsubscribe) { treasuryUnsubscribe(); treasuryUnsubscribe = null; }
                        transactions = txData;
                        treasuryCategories = catData;
                        activeTreasurySpace = {
                            passphrase: newPass,
                            hash,
                            spaceName: newName,
                            isOwner: true,
                            permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
                            isBlocked: false,
                            members: initialData.members,
                            logs: initialData.logs
                        };
                        
                        localStorage.setItem('owned_space_' + hash, 'true');
                    } else {
                        const expData = shouldCopy && Array.isArray(personalExpenses) ? sanitizeData(personalExpenses) : [];
                        const incData = shouldCopy && personalIncomes && typeof personalIncomes === 'object' ? sanitizeData(personalIncomes) : {};
                        const catData = shouldCopy && Array.isArray(personalCategories) ? sanitizeData(personalCategories) : [...DEFAULT_PERSONAL_CATEGORIES];
                        initialData.personalExpenses = expData;
                        initialData.personalIncomes = incData;
                        initialData.personalCategories = catData;
                        
                        if (sharedDocRef) {
                            try {
                                await setDoc(sharedDocRef, sanitizeData(initialData), { merge: true });
                            } catch (cloudErr) {
                                console.warn("Aviso al sincronizar en shared_personales:", cloudErr);
                            }
                        }
                        
                        if (personalUnsubscribe) { personalUnsubscribe(); personalUnsubscribe = null; }
                        personalExpenses = expData;
                        personalIncomes = incData;
                        personalCategories = catData;
                        activePersonalSpace = {
                            passphrase: newPass,
                            hash,
                            spaceName: newName,
                            isOwner: true,
                            permissions: { allowEdit: true, allowDelete: true, allowAdd: true, isReadOnly: false },
                            isBlocked: false,
                            members: initialData.members,
                            logs: initialData.logs
                        };

                        localStorage.setItem('owned_space_' + hash, 'true');
                    }

                    const savedList = userSavedWorkspaces[currentManagePassphraseModule] || [];
                    const existingIdx = savedList.findIndex(w => w.hash === hash);
                    if (existingIdx >= 0) {
                        savedList[existingIdx].name = newName;
                        savedList[existingIdx].passphrase = newPass;
                        savedList[existingIdx].isOwner = true;
                    } else {
                        savedList.push({ hash, passphrase: newPass, name: newName, isOwner: true });
                    }
                    userSavedWorkspaces[currentManagePassphraseModule] = savedList;
                    try {
                        await saveSavedWorkspacesToUser();
                    } catch (swErr) {
                        console.warn("No se pudo sincronizar workspaces guardados:", swErr);
                    }

                    try {
                        await setupSpaceListener(currentManagePassphraseModule);
                    } catch (slErr) {
                        console.warn("Aviso al iniciar listener del espacio:", slErr);
                    }

                    updateSpaceBadgeUI(currentManagePassphraseModule);
                    if (isTreasury) render(); else renderPersonalFinances();
                    showToast(`¡Nuevo espacio '${newName}' creado e iniciado correctamente!`, 'success');
                } else {
                    // Modo Edicion del espacio activo (Local o Compartido)
                    activeSpace.spaceName = newName;
                    const passToUse = newPass || activeSpace.passphrase || '';
                    activeSpace.passphrase = passToUse;

                    if (activeSpace.hash) {
                        // Editando un ESPACIO COMPARTIDO ACTIVO
                        const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
                        if (currentUser && db) {
                            const sharedDocRef = doc(db, collectionName, activeSpace.hash);
                            const safeEmail = currentUser.email || '';
                            const safeDisplayName = currentUser.displayName || (safeEmail ? safeEmail.split('@')[0] : 'Usuario');
                            
                            const sharedData = {
                                spaceName: newName,
                                updatedAt: new Date().toISOString()
                            };
                            if (passToUse) sharedData.passphrase = passToUse;

                            try {
                                await setDoc(sharedDocRef, sanitizeData(sharedData), { merge: true });
                            } catch (sharedSaveErr) {
                                console.warn("Aviso al guardar cambios en coleccion compartida:", sharedSaveErr);
                            }
                        }

                        const savedList = userSavedWorkspaces[currentManagePassphraseModule] || [];
                        const existingIdx = savedList.findIndex(w => w.hash === activeSpace.hash);
                        if (existingIdx >= 0) {
                            savedList[existingIdx].name = newName;
                            if (passToUse) savedList[existingIdx].passphrase = passToUse;
                        } else {
                            savedList.push({ hash: activeSpace.hash, passphrase: passToUse, name: newName, isOwner: true });
                        }
                        userSavedWorkspaces[currentManagePassphraseModule] = savedList;
                        try {
                            await saveSavedWorkspacesToUser();
                        } catch (swErr) {
                            console.warn("No se pudo sincronizar workspaces guardados:", swErr);
                        }

                        try {
                            await setupSpaceListener(currentManagePassphraseModule);
                        } catch (slErr) {
                            console.warn("Error iniciando listener del espacio:", slErr);
                        }
                    } else {
                        // Editando el ESPACIO LOCAL / PRIVADO
                        if (isTreasury) {
                            localStorage.setItem('treasury_space_name', newName);
                            if (passToUse) localStorage.setItem('treasury_passphrase', passToUse);
                        } else {
                            localStorage.setItem('personal_space_name', newName);
                            if (passToUse) localStorage.setItem('personal_passphrase', passToUse);
                        }

                        if (currentUser && db) {
                            const userDocRef = doc(db, 'users', currentUser.uid);
                            const updatePayload = {
                                [isTreasury ? 'treasurySpaceName' : 'personalSpaceName']: newName,
                                updatedAt: new Date().toISOString()
                            };
                            if (passToUse) {
                                const passHash = await hashPassphrase(currentManagePassphraseModule, passToUse);
                                updatePayload[isTreasury ? 'treasuryPassphrase' : 'personalPassphrase'] = passToUse;
                                updatePayload[isTreasury ? 'treasuryPassphraseHash' : 'personalPassphraseHash'] = passHash;
                                
                                // Publicar en la colección compartida para que otros usuarios puedan conectarse
                                const collectionName = isTreasury ? 'shared_tesoreria' : 'shared_personales';
                                const sharedDocRef = doc(db, collectionName, passHash);
                                const safeEmail = currentUser.email || '';
                                const safeDisplayName = currentUser.displayName || (safeEmail ? safeEmail.split('@')[0] : 'Usuario');

                                const sharedData = {
                                    spaceName: newName,
                                    ownerUid: currentUser.uid,
                                    ownerEmail: safeEmail,
                                    passphrase: passToUse,
                                    updatedAt: new Date().toISOString(),
                                    members: {
                                        [currentUser.uid]: {
                                            email: safeEmail,
                                            displayName: safeDisplayName,
                                            joinedAt: new Date().toISOString(),
                                            isBlocked: false,
                                            permissions: { allowAdd: true, allowEdit: true, allowDelete: true, isReadOnly: false }
                                        }
                                    },
                                    logs: [{
                                        id: Date.now().toString(),
                                        timestamp: new Date().toLocaleString(),
                                        userEmail: safeEmail || 'Usuario',
                                        action: 'CREAR',
                                        details: `Configuró la frase de acceso '${passToUse}' para compartir este espacio`
                                    }]
                                };

                                if (isTreasury) {
                                    sharedData.transactions = Array.isArray(transactions) ? sanitizeData(transactions) : [];
                                    sharedData.treasuryCategories = Array.isArray(treasuryCategories) ? sanitizeData(treasuryCategories) : [...DEFAULT_TREASURY_CATEGORIES];
                                } else {
                                    sharedData.personalExpenses = Array.isArray(personalExpenses) ? sanitizeData(personalExpenses) : [];
                                    sharedData.personalIncomes = (personalIncomes && typeof personalIncomes === 'object') ? sanitizeData(personalIncomes) : {};
                                    sharedData.personalCategories = Array.isArray(personalCategories) ? sanitizeData(personalCategories) : [...DEFAULT_PERSONAL_CATEGORIES];
                                }

                                try {
                                    await setDoc(sharedDocRef, sanitizeData(sharedData), { merge: true });
                                } catch (sharedSaveErr) {
                                    console.warn("Aviso al publicar en colección compartida:", sharedSaveErr);
                                }
                            } else {
                                updatePayload[isTreasury ? 'treasuryPassphrase' : 'personalPassphrase'] = '';
                                updatePayload[isTreasury ? 'treasuryPassphraseHash' : 'personalPassphraseHash'] = '';
                            }
                            await setDoc(userDocRef, updatePayload, { merge: true });
                        }
                    }
                    
                    updateSpaceBadgeUI(currentManagePassphraseModule);
                    showToast(`Espacio '${newName}' actualizado correctamente.`, 'success');
                }

                closeModal(document.getElementById('modal-manage-passphrase'));
            } catch (err) {
                console.error("Error al guardar espacio:", err);
                showToast('Error al guardar cambios de espacio: ' + (err.message || 'Error desconocido'), 'error');
            }
        });
    }

    // Boton Desconectarse / Dejar de Compartir Espacio / Eliminar Passphrase Local
    const btnMmpDisconnect = document.getElementById('btn-mmp-disconnect');
    if (btnMmpDisconnect) {
        btnMmpDisconnect.addEventListener('click', async () => {
            const isTreasury = currentManagePassphraseModule === 'tesoreria';
            const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;

            if (!activeSpace.hash) {
                // Caso: El usuario está en su cuenta local y desea ELIMINAR la passphrase
                if (!confirm('¿Deseas eliminar la frase de acceso de tu cuenta local para que sea 100% privada y exclusiva?')) return;
                
                activeSpace.passphrase = '';
                activeSpace.hash = '';

                if (isTreasury) {
                    localStorage.removeItem('treasury_passphrase');
                    localStorage.removeItem('treasury_passphrase_hash');
                } else {
                    localStorage.removeItem('personal_passphrase');
                    localStorage.removeItem('personal_passphrase_hash');
                }

                if (currentUser && db) {
                    try {
                        const userDocRef = doc(db, 'users', currentUser.uid);
                        await setDoc(userDocRef, {
                            [isTreasury ? 'treasuryPassphrase' : 'personalPassphrase']: '',
                            [isTreasury ? 'treasuryPassphraseHash' : 'personalPassphraseHash']: '',
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                    } catch (uErr) {
                        console.warn("Aviso al limpiar passphrase en Firestore:", uErr);
                    }
                }

                const mmpInputPass = document.getElementById('mmp-passphrase-input');
                if (mmpInputPass) mmpInputPass.value = '';
                const mmpModal = document.getElementById('modal-manage-passphrase');
                if (mmpModal) closeModal(mmpModal);

                updateSpaceBadgeUI(currentManagePassphraseModule);
                showToast('Frase de acceso eliminada. Tu cuenta local ahora es 100% privada y exclusiva.', 'success');
                return;
            }

            // Caso: El usuario está en un espacio compartido y desea desconectarse / volver a su cuenta local
            let confirmMsg = '¿Deseas desconectarte de este espacio compartido y volver a tu Cuenta Local privada?';
            if (activeSpace.isOwner) {
                confirmMsg = '¿Deseas dejar de compartir este espacio? Seguirás conservando todos tus datos en tu cuenta local.';
            }

            if (!confirm(confirmMsg)) return;

            await disconnectActiveSpace(currentManagePassphraseModule);
        });
    }

    // Formulario de Transferencia de Propiedad (Exclusivo Modulo de Tesoreria)
    const mmpTransferForm = document.getElementById('mmp-transfer-form');
    if (mmpTransferForm) {
        mmpTransferForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newEmailInput = document.getElementById('mmp-new-owner-email');
            const newEmail = newEmailInput ? newEmailInput.value.trim() : '';
            if (!newEmail) return;

            const activeSpace = activeTreasurySpace;
            const isOwner = activeSpace.isOwner || !activeSpace.hash;
            if (!isOwner) {
                showToast('Solo el Tesorero Principal puede transferir la propiedad.', 'error');
                return;
            }

            if (confirm(`?Est!s seguro de transferir los derechos de Tesorero Principal a ${newEmail}? Tu rol pasar! a ser integrante est!ndar.`)) {
                try {
                    let spaceHash = activeSpace.hash;
                    if (!spaceHash) {
                        const autoPass = activeSpace.passphrase || 'tesoreria2026';
                        spaceHash = await hashPassphrase('tesoreria', autoPass);
                        activeSpace.hash = spaceHash;
                        activeSpace.passphrase = autoPass;
                        activeSpace.spaceName = activeSpace.spaceName || 'Tesoreria Iglesia';
                    }

                    const spaceDocRef = doc(db, 'shared_tesoreria', spaceHash);
                    const docSnap = await getDoc(spaceDocRef);
                    if (!docSnap.exists()) {
                        await setDoc(spaceDocRef, {
                            spaceName: activeSpace.spaceName,
                            ownerUid: currentUser.uid,
                            ownerEmail: newEmail,
                            pendingOwnerTransfer: true,
                            members: {
                                [currentUser.uid]: {
                                    email: currentUser.email,
                                    displayName: currentUser.displayName || currentUser.email.split('@')[0],
                                    joinedAt: new Date().toISOString(),
                                    isBlocked: false,
                                    permissions: { allowEdit: true, allowDelete: true }
                                }
                            },
                            transactions: [...transactions],
                            treasuryCategories: [...treasuryCategories],
                            logs: [{
                                id: Date.now().toString(),
                                timestamp: new Date().toLocaleString(),
                                userEmail: currentUser.email,
                                action: 'TRANSFERIR_PROPIEDAD',
                                details: `Transfirio la propiedad del modulo de Tesoreria a ${newEmail}`
                            }]
                        });
                    } else {
                        await updateDoc(spaceDocRef, {
                            ownerEmail: newEmail,
                            pendingOwnerTransfer: true,
                            logs: [
                                {
                                    id: Date.now().toString(),
                                    timestamp: new Date().toLocaleString(),
                                    userEmail: currentUser.email,
                                    action: 'TRANSFERIR_PROPIEDAD',
                                    details: `Transfirio la propiedad del modulo de Tesoreria a ${newEmail}`
                                },
                                ...(activeSpace.logs || []).slice(0, 99)
                            ]
                        });
                    }

                    await setupSpaceListener('tesoreria');
                    if (newEmailInput) newEmailInput.value = '';
                    closeModal(document.getElementById('modal-manage-passphrase'));
                    showToast(` Transferencia de Tesorero Principal enviada a ${newEmail}.`, 'success');
                } catch (err) {
                    console.error("Error al transferir propiedad:", err);
                    showToast('Error al transferir la propiedad.', 'error');
                }
            }
        });
    }
    
    // Finanzas Personales
    if (pfConcept) {
        pfConcept.addEventListener('input', handlePfConceptInput);
        pfConcept.addEventListener('focus', handlePfConceptInput);
    }
    if (pfCategory) {
        pfCategory.addEventListener('input', () => {
            userEditedPfCategory = true;
        });
    }
    if (pfExpenseForm) {
        pfExpenseForm.addEventListener('submit', handlePfExpenseSubmit);
    }
    if (pfMonthlyIncome) {
        pfMonthlyIncome.addEventListener('change', handlePfBudgetChange);
        pfMonthlyIncome.addEventListener('input', handlePfBudgetChange);
    }
    
    // Filtros de Finanzas Personales
    if (pfFilterMonth) {
        pfFilterMonth.addEventListener('change', renderPersonalFinances);
    }
    if (pfFilterYear) {
        pfFilterYear.addEventListener('change', renderPersonalFinances);
    }
    if (btnPfCancelEdit) {
        btnPfCancelEdit.addEventListener('click', cancelEditPersonalExpense);
    }
    
    // Acciones de Finanzas Personales
    if (btnPfReport) {
        btnPfReport.addEventListener('click', downloadPfReport);
    }
    if (btnPfExport) {
        btnPfExport.addEventListener('click', exportPfBackup);
    }
    if (btnPfImportTrigger) {
        btnPfImportTrigger.addEventListener('click', () => {
            pfCsvFileInput.value = '';
            pfCsvFileInput.click();
        });
    }
    if (pfCsvFileInput) {
        pfCsvFileInput.addEventListener('change', handleImportPfCsvFile);
    }
    if (btnPfClearData) {
        btnPfClearData.addEventListener('click', () => openModal(modalPfClear));
    }
    
    // Botones de Modales de Finanzas Personales
    if (btnPfImportCancel) {
        btnPfImportCancel.addEventListener('click', () => {
            closeModal(modalPfImport);
            parsedPfExpensesToImport = [];
            parsedPfIncomeToImport = 0.00;
        });
    }
    if (btnPfImportConfirm) {
        btnPfImportConfirm.addEventListener('click', executePfImport);
    }
    if (btnPfClearCancel) {
        btnPfClearCancel.addEventListener('click', () => closeModal(modalPfClear));
    }
    if (btnPfClearConfirm) {
        btnPfClearConfirm.addEventListener('click', executePfClearData);
    }
    
    // Panel de Configuracion de Categorias
    if (btnTManageCategories) {
        btnTManageCategories.addEventListener('click', () => {
            currentCategoryModule = 'tesoreria';
            if (mcModalTitle) mcModalTitle.textContent = 'Configurar Categorias: Tesoreria';
            resetMcForm();
            renderMcColorPicker();
            renderCategoryManagerList();
            openModal(modalManageCategories);
        });
    }
    if (btnPfManageCategories) {
        btnPfManageCategories.addEventListener('click', () => {
            currentCategoryModule = 'personales';
            if (mcModalTitle) mcModalTitle.textContent = 'Configurar Categorias: Finanzas Personales';
            resetMcForm();
            renderMcColorPicker();
            renderCategoryManagerList();
            openModal(modalManageCategories);
        });
    }
    if (mcCategoryForm) {
        mcCategoryForm.addEventListener('submit', handleMcCategorySubmit);
    }
    if (btnMcClose) {
        btnMcClose.addEventListener('click', () => closeModal(modalManageCategories));
    }
    
    // Cierre / Archivo Anual
    const btnTArchiveYear = document.getElementById('btn-t-archive-year');
    const btnPfArchiveYear = document.getElementById('btn-pf-archive-year');
    const btnCloseArchiveModal = document.getElementById('btn-close-archive-modal');
    const btnCancelArchive = document.getElementById('btn-cancel-archive');
    const btnExecuteArchive = document.getElementById('btn-execute-archive');
    const archiveYearSelect = document.getElementById('archive-year-select');

    if (btnTArchiveYear) btnTArchiveYear.addEventListener('click', () => openArchiveYearModal('tesoreria'));
    if (btnPfArchiveYear) btnPfArchiveYear.addEventListener('click', () => openArchiveYearModal('personales'));
    if (btnCloseArchiveModal) btnCloseArchiveModal.addEventListener('click', closeArchiveYearModal);
    if (btnCancelArchive) btnCancelArchive.addEventListener('click', closeArchiveYearModal);
    if (btnExecuteArchive) btnExecuteArchive.addEventListener('click', executeArchiveYear);
    if (archiveYearSelect) archiveYearSelect.addEventListener('change', updateArchiveModalSummary);

    // Boton de subir al inicio (Scroll-to-top)
    window.addEventListener('scroll', updateScrollTopButtonVisibility);
    const btnScrollTop = document.getElementById('btn-scroll-top');
    if (btnScrollTop) {
        btnScrollTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}

// --- LÓGICA DE CIERRE / ARCHIVO ANUAL ---

let currentArchiveModule = 'tesoreria';

function openArchiveYearModal(moduleName) {
    const isTreasury = moduleName === 'tesoreria';
    const activeSpace = isTreasury ? activeTreasurySpace : activePersonalSpace;
    const isOwner = activeSpace.isOwner || !activeSpace.hash;

    if (!isOwner) {
        showToast('Acción restringida: Solo el propietario del espacio puede realizar Cierre o Archivo Anual.', 'error');
        return;
    }

    currentArchiveModule = moduleName;
    const modal = document.getElementById('modal-archive-year');
    const tag = document.getElementById('archive-module-tag');
    const select = document.getElementById('archive-year-select');
    
    if (tag) {
        tag.textContent = isTreasury ? 'Tesorería' : 'Finanzas Personales';
    }

    
    const sourceList = isTreasury ? transactions : personalExpenses;
    
    const yearsSet = new Set();
    const currentYear = new Date().getFullYear();
    
    sourceList.forEach(item => {
        if (item.fecha) {
            const y = parseInt(item.fecha.split('-')[0]);
            if (!isNaN(y)) yearsSet.add(y);
        }
    });
    
    if (yearsSet.size === 0) {
        yearsSet.add(currentYear - 1);
        yearsSet.add(currentYear);
    }
    
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    
    if (select) {
        select.innerHTML = '';
        sortedYears.forEach(year => {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = `Año fiscal ${year}`;
            select.appendChild(opt);
        });
    }
    
    updateArchiveModalSummary();
    if (modal) openModal(modal);
}

function closeArchiveYearModal() {
    const modal = document.getElementById('modal-archive-year');
    if (modal) closeModal(modal);
}

function updateArchiveModalSummary() {
    const select = document.getElementById('archive-year-select');
    const statRecords = document.getElementById('archive-stat-records');
    const statAmount = document.getElementById('archive-stat-amount');
    if (!select || !statRecords || !statAmount) return;
    
    const selYear = select.value;
    const isTreasury = currentArchiveModule === 'tesoreria';
    
    let count = 0;
    let total = 0;
    
    if (isTreasury) {
        const matches = transactions.filter(t => t.fecha && t.fecha.startsWith(selYear));
        count = matches.length;
        total = matches.reduce((acc, t) => acc + (parseFloat(t.monto) || 0), 0);
    } else {
        const matches = personalExpenses.filter(e => e.fecha && e.fecha.startsWith(selYear));
        count = matches.length;
        total = matches.reduce((acc, e) => acc + (parseFloat(e.monto) || 0), 0);
    }
    
    statRecords.textContent = count.toString();
    statAmount.textContent = formatCurrency(total);
}

async function executeArchiveYear() {
    const select = document.getElementById('archive-year-select');
    if (!select) return;
    
    const selYear = select.value;
    const isTreasury = currentArchiveModule === 'tesoreria';
    
    const matches = isTreasury 
        ? transactions.filter(t => t.fecha && t.fecha.startsWith(selYear))
        : personalExpenses.filter(e => e.fecha && e.fecha.startsWith(selYear));
        
    if (matches.length === 0) {
        showToast(`No hay registros correspondientes al año ${selYear} para archivar.`, 'warning');
        return;
    }
    
    // 1. Generar y descargar archivo CSV de respaldo garantizado
    let csvContent = '\uFEFF';
    if (isTreasury) {
        csvContent += 'fecha,concepto,tipo,categoria,monto\r\n';
        const sorted = [...matches].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        sorted.forEach(t => {
            const row = [t.fecha, escapeCSVField(t.concepto), t.tipo, escapeCSVField(t.categoria), t.monto];
            csvContent += row.join(',') + '\r\n';
        });
    } else {
        csvContent += 'id,fecha,concepto,monto,tipo,estado,categoria\r\n';
        const sorted = [...matches].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        sorted.forEach(e => {
            const row = [e.id, e.fecha, escapeCSVField(e.concepto), e.monto, e.tipo, e.estado, escapeCSVField(e.categoria || '')];
            csvContent += row.join(',') + '\r\n';
        });
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `archivo-historico-${currentArchiveModule}-${selYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 2. Eliminar los registros de la subcolección en Firestore (usando writeBatch)
    if (isTreasury) {
        const colRef = getTreasuryCollectionRef();
        if (colRef) {
            try {
                for (let i = 0; i < matches.length; i += 400) {
                    const batch = writeBatch(db);
                    const chunk = matches.slice(i, i + 400);
                    chunk.forEach(t => batch.delete(doc(colRef, t.id)));
                    await batch.commit();
                }
            } catch (e) {
                console.error("Error archivando transacciones en Firestore:", e);
            }
        }
        transactions = transactions.filter(t => !t.fecha || !t.fecha.startsWith(selYear));
        await saveTransactionsMetadata();
        await addAuditLog('tesoreria', 'ELIMINAR', `Completó Cierre y Archivo Anual del año ${selYear} (${matches.length} registros respaldados y liberados)`);
        
        initFilters();
        render();
    } else {
        const colRef = getPersonalCollectionRef();
        if (colRef) {
            try {
                for (let i = 0; i < matches.length; i += 400) {
                    const batch = writeBatch(db);
                    const chunk = matches.slice(i, i + 400);
                    chunk.forEach(e => batch.delete(doc(colRef, e.id)));
                    await batch.commit();
                }
            } catch (e) {
                console.error("Error archivando gastos personales en Firestore:", e);
            }
        }
        personalExpenses = personalExpenses.filter(e => !e.fecha || !e.fecha.startsWith(selYear));
        Object.keys(personalIncomes).filter(k => k.startsWith(selYear)).forEach(k => delete personalIncomes[k]);
        await savePersonalFinancesMetadata();
        await addAuditLog('personales', 'ELIMINAR', `Completó Cierre y Archivo Anual del año ${selYear} (${matches.length} registros respaldados y liberados)`);
        
        initPfFilters();
        renderPersonalFinances();
    }
    
    closeArchiveYearModal();
    showToast(`✅ Cierre del año ${selYear} completado con éxito. Se descargó el archivo histórico y se optimizó el almacenamiento.`, 'success');
}


function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('tema', isDark ? 'dark' : 'light');
    showToast(`Modo ${isDark ? 'oscuro' : 'claro'} activado`, 'info');
    
    // Si estamos en algun modulo activo, refrescar para actualizar los colores de los textos de los gr!ficos
    if (currentModule === 'personales') {
        renderPersonalFinances();
    } else if (currentModule === 'tesoreria') {
        render();
    }
}

// --- LOGICA DE AUTOCOMPLETADO ---

// Normaliza texto eliminando acentos/diacriticos y convirtiendo a minusculas
function normalizeText(str) {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function handleConceptInput() {
    const val = inputConcept.value;
    const valNorm = normalizeText(val);
    closeAutocomplete();
    
    if (!valNorm) {
        if (!userEditedCategory) {
            inputCategory.value = '';
        }
        return;
    }
    
    // Obtener conceptos unicos de los valores por defecto
    const conceptMap = new Map();
    DEFAULT_CONCEPT_CATEGORIES.forEach(item => {
        conceptMap.set(normalizeText(item.concepto), {
            original: item.concepto,
            categoria: item.categoria
        });
    });
    
    // Sobrescribir/anadir con el historial de transacciones reales (m!xima prioridad)
    transactions.forEach(t => {
        const conceptNorm = t.concepto.trim();
        if (conceptNorm) {
            conceptMap.set(normalizeText(conceptNorm), {
                original: conceptNorm,
                categoria: t.categoria
            });
        }
    });
    
    const uniqueConcepts = Array.from(conceptMap.values());
    
    // Buscar coincidencias parciales con el texto normalizado
    const matches = uniqueConcepts.filter(item => 
        normalizeText(item.original).includes(valNorm)
    ).slice(0, 5); // M!ximo 5 sugerencias
    
    if (matches.length > 0) {
        matches.forEach(match => {
            const div = document.createElement('div');
            
            // Resaltar el fragmento coincidente en el texto original
            const origLower = match.original.toLowerCase();
            const valLower = val.toLowerCase();
            const index = origLower.indexOf(valLower);
            
            if (index !== -1) {
                const before = match.original.substring(0, index);
                const matchText = match.original.substring(index, index + val.length);
                const after = match.original.substring(index + val.length);
                div.innerHTML = `${before}<strong>${matchText}</strong>${after}`;
            } else {
                div.textContent = match.original;
            }
            
            div.addEventListener('click', () => {
                inputConcept.value = match.original;
                inputCategory.value = match.categoria;
                userEditedCategory = false; // Resetear bandera al elegir una sugerencia
                closeAutocomplete();
                showToast('Categoria autocompletada', 'info');
            });
            
            autocompleteList.appendChild(div);
        });
    }
    
    // Autocompletado directo y reactivo en el campo categoria
    if (!userEditedCategory) {
        // Buscar coincidencia que empiece con el texto escrito
        const bestMatch = uniqueConcepts.find(item => normalizeText(item.original).startsWith(valNorm)) ||
                          uniqueConcepts.find(item => normalizeText(item.original).includes(valNorm));
        
        if (bestMatch) {
            inputCategory.value = bestMatch.categoria;
        } else {
            // Intentar detectar coincidencia por palabras clave (keywords)
            let matchedCategoryByKeyword = null;
            for (const rule of KEYWORD_CATEGORY_RULES) {
                const found = rule.keywords.some(kw => valNorm.includes(normalizeText(kw)));
                if (found) {
                    matchedCategoryByKeyword = rule.categoria;
                    break;
                }
            }

            if (matchedCategoryByKeyword) {
                inputCategory.value = matchedCategoryByKeyword;
            } else {
                // Intentar detectar si el termino ingresado coincide con el nombre de alguna categoria conocida
                const knownCategories = new Set(uniqueConcepts.map(item => item.categoria));
                const matchedCategory = Array.from(knownCategories).find(cat => 
                    valNorm.includes(normalizeText(cat)) || normalizeText(cat).includes(valNorm)
                );
                if (matchedCategory && valNorm.length >= 3) {
                    inputCategory.value = matchedCategory;
                } else {
                    inputCategory.value = '';
                }
            }
        }
    }
}

function closeAutocomplete() {
    autocompleteList.innerHTML = '';
}

// --- LOGICA DE RENDERIZACIoN ---

function render() {
    const isAllMonths = filterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(filterMonth.value);
    const selYear = parseInt(filterYear.value);
    
    // Filtrar transacciones del mes (o todos) y aio seleccionados
    const filtered = transactions.filter(t => {
        if (!t.fecha) return false;
        const [year, month] = t.fecha.split('-').map(Number);
        return year === selYear && (isAllMonths || (month - 1) === selMonth);
    });
    
    // Ordenar por fecha descendente, y luego por fecha de creacion descendente
    filtered.sort((a, b) => {
        const dateDiff = new Date(b.fecha) - new Date(a.fecha);
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    
    // Calcular Resumen del periododo filtrado
    let totalIncome = 0;
    let totalExpense = 0;
    
    filtered.forEach(t => {
        const monto = parseFloat(t.monto) || 0;
        if (t.tipo === 'ingreso') {
            totalIncome += monto;
        } else if (t.tipo === 'gasto') {
            totalExpense += monto;
        }
    });
    
    const totalBalance = totalIncome - totalExpense;
    
    // Calcular Saldo Historico (toda la historia guardada)
    let histIncome = 0;
    let histExpense = 0;
    transactions.forEach(t => {
        const monto = parseFloat(t.monto) || 0;
        if (t.tipo === 'ingreso') {
            histIncome += monto;
        } else if (t.tipo === 'gasto') {
            histExpense += monto;
        }
    });
    const historicalBalance = histIncome - histExpense;
    
    // Mostrar totales del periododo
    totalIncomeEl.textContent = formatCurrency(totalIncome);
    totalExpenseEl.textContent = formatCurrency(totalExpense);
    totalBalanceEl.textContent = formatCurrency(totalBalance);
    
    // Mostrar Saldo Historico
    const historicalBalanceEl = document.getElementById('historical-balance');
    if (historicalBalanceEl) {
        historicalBalanceEl.textContent = formatCurrency(historicalBalance);
        if (historicalBalance < 0) {
            historicalBalanceEl.style.color = 'var(--expense-color)';
        } else {
            historicalBalanceEl.style.color = 'var(--historical-color)';
        }
    }
    
    // Actualizar etiqueta del saldo del periododo
    const labelBalanceEl = document.getElementById('label-balance');
    if (labelBalanceEl) {
        labelBalanceEl.textContent = isAllMonths ? 'Saldo del aio' : 'Saldo del mes';
    }

    // Actualizar titulo de la seccion de transacciones
    const labelTransactionsTitleEl = document.getElementById('label-transactions-title');
    if (labelTransactionsTitleEl) {
        labelTransactionsTitleEl.textContent = isAllMonths ? 'Transacciones del aio' : 'Transacciones del mes';
    }
    
    // Actualizar p!rrafo de estado vacio
    const labelEmptyStateEl = document.getElementById('label-empty-state');
    if (labelEmptyStateEl) {
        labelEmptyStateEl.textContent = isAllMonths ? 'No hay transacciones registradas para este aio.' : 'No hay transacciones registradas para este mes.';
    }
    
    // Actualizar texto del boton de reporte
    const labelReportBtnEl = document.getElementById('label-report-btn');
    if (labelReportBtnEl) {
        labelReportBtnEl.textContent = 'Generar reporte';
    }
    
    // Modificar clases del saldo segun su valor (opcional, siempre azul pero da feedback)
    if (totalBalance < 0) {
        totalBalanceEl.style.color = 'var(--expense-color)';
    } else {
        totalBalanceEl.style.color = 'var(--balance-color)';
    }
    
    // Limpiar tabla
    transactionsTableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        emptyStateEl.style.display = 'block';
    } else {
        emptyStateEl.style.display = 'none';
        
        filtered.forEach(t => {
            const tr = document.createElement('tr');
            
            const tdFecha = document.createElement('td');
            tdFecha.textContent = formatDateString(t.fecha);
            tr.appendChild(tdFecha);
            
            const tdConcepto = document.createElement('td');
            tdConcepto.textContent = t.concepto;
            tr.appendChild(tdConcepto);
            
            const tdTipo = document.createElement('td');
            const spanBadge = document.createElement('span');
            spanBadge.className = `badge badge-${t.tipo}`;
            spanBadge.textContent = t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto';
            tdTipo.appendChild(spanBadge);
            tr.appendChild(tdTipo);
            
            const tdCategoria = document.createElement('td');
            if (t.categoria) {
                let catColor = '#6b7280';
                const found = treasuryCategories.find(c => c.name.toLowerCase() === t.categoria.toLowerCase());
                if (found) catColor = found.color;
                
                const badge = document.createElement('span');
                badge.style.backgroundColor = `${catColor}15`;
                badge.style.color = catColor;
                badge.style.border = `1px solid ${catColor}30`;
                badge.style.padding = '2px 6px';
                badge.style.borderRadius = '4px';
                badge.style.fontSize = '8pt';
                badge.style.fontWeight = '600';
                badge.style.display = 'inline-block';
                badge.textContent = t.categoria;
                tdCategoria.appendChild(badge);
            } else {
                tdCategoria.textContent = '-';
            }
            tr.appendChild(tdCategoria);
            
            const tdMonto = document.createElement('td');
            tdMonto.className = t.tipo === 'ingreso' ? 'td-income' : 'td-expense';
            tdMonto.textContent = (t.tipo === 'ingreso' ? '+ ' : '- ') + formatCurrency(t.monto);
            tr.appendChild(tdMonto);
            
            const tdAcciones = document.createElement('td');
            tdAcciones.className = 'text-right';
            
            // Boton Editar (Si tiene permiso)
            if (activeTreasurySpace.permissions.allowEdit) {
                const btnEdit = document.createElement('button');
                btnEdit.className = 'btn-edit';
                btnEdit.setAttribute('aria-label', 'Editar transaccion');
                btnEdit.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                `;
                btnEdit.addEventListener('click', () => startEditTransaction(t.id));
                tdAcciones.appendChild(btnEdit);
            }
            
            // Boton Eliminar (Si tiene permiso)
            if (activeTreasurySpace.permissions.allowDelete) {
                const btnDel = document.createElement('button');
                btnDel.className = 'btn-delete';
                btnDel.setAttribute('aria-label', 'Eliminar transaccion');
                btnDel.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                `;
                btnDel.addEventListener('click', () => requestDeleteTransaction(t.id));
                tdAcciones.appendChild(btnDel);
            }
            tr.appendChild(tdAcciones);
            
            transactionsTableBody.appendChild(tr);
        });
    }
    
    // Renderizar gr!ficos de Tesoreria
    renderTCharts();
}

// --- CREAR O EDITAR TRANSACCIÓN (FORM SUBMIT) ---

async function handleFormSubmit(e) {
    e.preventDefault();

    if (activeTreasurySpace.permissions.isReadOnly || activeTreasurySpace.permissions.allowAdd === false) {
        showToast('i Modo Solo Lectura: No tienes permiso para agregar transacciones.', 'error');
        return;
    }

    const fecha = inputDate.value;
    const concepto = inputConcept.value.trim();
    const montoRaw = inputAmount.value;
    const tipo = inputType.value;
    const categoria = inputCategory.value.trim();
    
    // Validaciones de negocio
    if (!fecha || !concepto || !montoRaw || !tipo || !categoria) {
        showToast('Todos los campos son obligatorios.', 'error');
        return;
    }
    
    const monto = parseFloat(montoRaw);
    if (isNaN(monto) || monto <= 0) {
        showToast('El monto debe ser un numero positivo mayor que 0.', 'error');
        return;
    }
    
    // Comprobar fecha futura
    const dateSelected = new Date(fecha + 'T00:00:00');
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Final de hoy
    
    if (dateSelected > today) {
        showToast('La fecha no puede ser futura.', 'error');
        return;
    }
    
    if (editingTransactionId !== null) {
        // Modo Edicion
        const idx = transactions.findIndex(t => t.id === editingTransactionId);
        if (idx !== -1) {
            transactions[idx].fecha = fecha;
            transactions[idx].concepto = concepto;
            transactions[idx].tipo = tipo;
            transactions[idx].categoria = categoria;
            transactions[idx].monto = monto;
            
            const colRef = getTreasuryCollectionRef();
            if (colRef) {
                try {
                    await setDoc(doc(colRef, editingTransactionId), sanitizeData(transactions[idx]), { merge: true });
                } catch (e) {
                    console.error("Error actualizando transacción en Firestore:", e);
                }
            }
            
            await addAuditLog('tesoreria', 'EDITAR', `Modificó ${tipo} "${concepto}" por RD$ ${monto.toFixed(2)}`);
            showToast('Transacción modificada con éxito.', 'success');
            
            // Restablecer filtros del mes/año modificado para verlo
            const [tYear, tMonth] = fecha.split('-').map(Number);
            filterMonth.value = tMonth - 1;
            filterYear.value = tYear;
            
            cancelEdit();
            render();
        } else {
            showToast('No se encontró la transacción a editar.', 'error');
            cancelEdit();
        }
        return;
    }
    
    // Modo Creación (Nuevo registro)
    const newTransaction = {
        id: 't-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        fecha: fecha,
        concepto: concepto,
        tipo: tipo,
        categoria: categoria,
        monto: monto,
        createdAt: new Date().toISOString()
    };
    
    transactions.push(newTransaction);
    
    const colRef = getTreasuryCollectionRef();
    if (colRef) {
        try {
            await setDoc(doc(colRef, newTransaction.id), sanitizeData(newTransaction));
        } catch (e) {
            console.error("Error guardando transacción en subcolección:", e);
        }
    }
    
    await addAuditLog('tesoreria', 'CREAR', `Registró ${tipo} "${concepto}" por RD$ ${monto.toFixed(2)}`);
    
    // Actualizar filtro de año si ingresaron un año nuevo
    const inputYear = parseInt(fecha.split('-')[0]);
    populateYearFilter(inputYear);
    
    // Ajustar filtros para que muestren la fecha de la transacción agregada
    const [tYear, tMonth] = fecha.split('-').map(Number);
    filterMonth.value = tMonth - 1;
    filterYear.value = tYear;
    
    // Limpiar formulario y restablecer valores
    inputConcept.value = '';
    inputAmount.value = '';
    inputCategory.value = '';
    inputType.value = 'ingreso';
    userEditedCategory = false;
    
    const todayStr = getTodayString();
    inputDate.value = todayStr;
    
    showToast('Transacción registrada con éxito.', 'success');
    
    // Re-renderizar
    render();
}

// --- SOPORTE PARA EDICIÓN ---

function startEditTransaction(id) {
    const t = transactions.find(item => item.id === id);
    if (!t) return;
    
    editingTransactionId = id;
    
    // Cargar datos en el formulario
    inputDate.value = t.fecha;
    inputConcept.value = t.concepto;
    inputAmount.value = t.monto;
    inputType.value = t.tipo;
    inputCategory.value = t.categoria;
    
    // Modificar boton de guardar cambios
    submitBtnText.textContent = 'Guardar';
    btnCancelEdit.classList.remove('hidden-btn');
    
    // Cambiar icono del submit button a un disquete
    submitBtnIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
        </svg>
    `;
    
    // Scroll suave hacia arriba para que el usuario vea el formulario cargado
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    
    showToast('Editando transacción...', 'info');
}

function cancelEdit() {
    editingTransactionId = null;
    userEditedCategory = false;
    
    // Limpiar formulario y restablecer valores
    inputConcept.value = '';
    inputAmount.value = '';
    inputCategory.value = '';
    inputType.value = 'ingreso';
    
    const todayStr = getTodayString();
    inputDate.value = todayStr;
    
    // Revertir elementos visuales del submit button
    submitBtnText.textContent = 'Agregar';
    btnCancelEdit.classList.add('hidden-btn');
    
    submitBtnIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
    `;
}

// --- ELIMINAR TRANSACCIÓN ---

function requestDeleteTransaction(id) {
    const t = transactions.find(item => item.id === id);
    if (!t) return;
    
    selectedTransactionIdToDelete = id;
    
    // Cargar detalles en el modal
    deleteDetailBox.innerHTML = `
        <p><strong>Fecha:</strong> ${formatDateString(t.fecha)}</p>
        <p><strong>Concepto:</strong> ${t.concepto}</p>
        <p><strong>Tipo:</strong> ${t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</p>
        <p><strong>Categoría:</strong> ${t.categoria}</p>
        <p><strong>Monto:</strong> ${formatCurrency(t.monto)}</p>
    `;
    
    openModal(modalDelete);
}

async function confirmDeleteTransaction() {
    if (!selectedTransactionIdToDelete) return;
    
    const targetItem = transactions.find(t => t.id === selectedTransactionIdToDelete);
    const initialCount = transactions.length;
    transactions = transactions.filter(t => t.id !== selectedTransactionIdToDelete);
    
    if (transactions.length < initialCount) {
        const colRef = getTreasuryCollectionRef();
        if (colRef) {
            try {
                await deleteDoc(doc(colRef, selectedTransactionIdToDelete));
            } catch (e) {
                console.error("Error eliminando transacción de Firestore:", e);
            }
        }
        
        if (targetItem) {
            await addAuditLog('tesoreria', 'ELIMINAR', `Eliminó ${targetItem.tipo} "${targetItem.concepto}" por RD$ ${parseFloat(targetItem.monto).toFixed(2)}`);
        }
        showToast('Transacción eliminada correctamente.', 'success');
    }
    
    closeModal(modalDelete);
    selectedTransactionIdToDelete = null;
    render();
}

// --- ACCIONES GENERALES ---

// 1. Limpiar Datos
async function executeClearData() {
    const colRef = getTreasuryCollectionRef();
    if (colRef) {
        try {
            const snap = await getDocs(colRef);
            for (let i = 0; i < snap.docs.length; i += 400) {
                const batch = writeBatch(db);
                const chunk = snap.docs.slice(i, i + 400);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        } catch (e) {
            console.error("Error limpiando subcolección de tesorería:", e);
        }
    }
    
    transactions = [];
    await saveTransactionsMetadata();
    
    // Restablecer filtros
    initFilters();
    
    closeModal(modalClear);
    showToast('Todos los datos han sido borrados.', 'success');
    render();
}


// 2. Exportar Respaldo Completo (CSV)
function downloadFullBackup() {
    if (transactions.length === 0) {
        showToast('No hay transacciones para exportar.', 'error');
        return;
    }
    
    // Generar contenido CSV
    let csvContent = '\uFEFF'; // UTF-8 BOM para soporte correcto de caracteres en Excel
    csvContent += 'fecha,concepto,tipo,categoria,monto\r\n';
    
    // Ordenar de m!s antiguo a m!s reciente para respaldos coherentes
    const sorted = [...transactions].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    sorted.forEach(t => {
        const row = [
            t.fecha,
            escapeCSVField(t.concepto),
            t.tipo,
            escapeCSVField(t.categoria),
            t.monto
        ];
        csvContent += row.join(',') + '\r\n';
    });
    
    // Crear Blob y enlace de descarga
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const dateToday = getTodayString();
    link.setAttribute('href', url);
    link.setAttribute('download', `respaldo-tesoreria-completo-${dateToday}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Respaldo completo exportado con exito.', 'success');
}

// 3. Generar Reporte Mensual/Anual (PDF/Impresion)
function downloadMonthlyReport() {
    const isAllMonths = filterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(filterMonth.value);
    const selYear = parseInt(filterYear.value);
    
    // Obtener idioma actual del navegador / Google Translate
    const currentLang = getCurrentLangFromCookie();
    
    const translations = {
        es: {
            noTransactionsYear: 'No hay transacciones registradas para este ano.',
            noTransactionsMonth: 'No hay transacciones registradas para este mes.',
            annualReport: 'Reporte Anual de Tesoreria',
            monthlyReport: 'Reporte Mensual de Tesoreria',
            subtitle: 'Detalle de ingresos y gastos de la tesoreria de la iglesia',
            period: 'Periodo',
            generated: 'Generado el',
            totalIncome: 'Total Ingresos',
            totalExpense: 'Total Gastos',
            annualBalance: 'Saldo del Ano',
            monthlyBalance: 'Saldo del Mes',
            date: 'Fecha',
            concept: 'Concepto',
            type: 'Tipo',
            category: 'Categoria',
            amount: 'Monto',
            income: 'Ingreso',
            expense: 'Gasto',
            footer: 'Reporte de Tesoreria de la Iglesia oficial - Generado de forma local y privada.',
            transactionsTitle: 'Transacciones del periodo',
            months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        },
        en: {
            noTransactionsYear: 'No transactions recorded for this year.',
            noTransactionsMonth: 'No transactions recorded for this month.',
            annualReport: 'Annual Treasury Report',
            monthlyReport: 'Monthly Treasury Report',
            subtitle: 'Detail of income and expenses of the church treasury',
            period: 'Period',
            generated: 'Generated on',
            totalIncome: 'Total Income',
            totalExpense: 'Total Expenses',
            annualBalance: 'Year Balance',
            monthlyBalance: 'Month Balance',
            date: 'Date',
            concept: 'Concept',
            type: 'Type',
            category: 'Category',
            amount: 'Amount',
            income: 'Income',
            expense: 'Expense',
            footer: 'Official Church Treasury Report - Generated locally and privately.',
            transactionsTitle: 'Transactions of the period',
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        },
        fr: {
            noTransactionsYear: 'Aucune transaction enregistree pour cette annee.',
            noTransactionsMonth: 'Aucune transaction enregistree pour ce mois.',
            annualReport: 'Rapport Annuel de la Tresorerie',
            monthlyReport: 'Rapport Mensuel de la Tresorerie',
            subtitle: 'Detail des revenus et depenses de la tresorerie de l\'eglise',
            period: 'Periode',
            generated: 'Genere le',
            totalIncome: 'Total des Revenus',
            totalExpense: 'Total des Depenses',
            annualBalance: 'Solde de l\'Annee',
            monthlyBalance: 'Solde du Mois',
            date: 'Date',
            concept: 'Concept',
            type: 'Type',
            category: 'Categorie',
            amount: 'Montant',
            income: 'Revenu',
            expense: 'Depense',
            footer: 'Rapport officiel de la tresorerie de l\'eglise - Genere localement et en prive.',
            transactionsTitle: 'Transactions de la periode',
            months: ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
        },
        pt: {
            noTransactionsYear: 'Nenhuma transacao registrada para este ano.',
            noTransactionsMonth: 'Nenhuma transacao registrada para este mas.',
            annualReport: 'Relatorio Anual de Tesouraria',
            monthlyReport: 'Relatorio Mensal de Tesouraria',
            subtitle: 'Detalhamento de receitas e despesas da tesouraria da igreja',
            period: 'Periodo',
            generated: 'Gerado em',
            totalIncome: 'Total de Receitas',
            totalExpense: 'Total de Despesas',
            annualBalance: 'Saldo do Ano',
            monthlyBalance: 'Saldo do Mas',
            date: 'Data',
            concept: 'Conceito',
            type: 'Tipo',
            category: 'Categoria',
            amount: 'Valor',
            income: 'Receita',
            expense: 'Despesa',
            footer: 'Relatorio Oficial da Tesouraria da Igreja - Gerado localmente e de forma privada.',
            transactionsTitle: 'Transacues do periodo',
            months: ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
        },
        it: {
            noTransactionsYear: 'Nessuna transazione registrata per quest\'anno.',
            noTransactionsMonth: 'Nessuna transazione registrata per questo mese.',
            annualReport: 'Rapporto Generale di Tesoreria',
            monthlyReport: 'Rapporto Mensile di Tesoreria',
            subtitle: 'Dettaglio delle entrate e delle uscite della tesoreria della chiesa',
            period: 'Periodo',
            generated: 'Generato il',
            totalIncome: 'Totale Entrate',
            totalExpense: 'Totale Spese',
            annualBalance: 'Saldo dell\'Anno',
            monthlyBalance: 'Saldo del Mese',
            date: 'Date',
            concept: 'Concept',
            type: 'Type',
            category: 'Category',
            amount: 'Importo',
            income: 'Entrata',
            expense: 'Spesa',
            footer: 'Rapporto Ufficiale della Tesoreria della Chiesa - Generato localmente e privatamente.',
            transactionsTitle: 'Transazioni del periodo',
            months: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
        },
        de: {
            noTransactionsYear: 'Fur dieses Jahr wurden keine Transaktionen erfasst.',
            noTransactionsMonth: 'Fur diesen Monat wurden keine Transaktionen erfasst.',
            annualReport: 'Jahrlicher Kassenbericht',
            monthlyReport: 'Monatlicher Kassenbericht',
            subtitle: 'Details zu Einnahmen und Ausgaben der Kirchenkasse',
            period: 'Zeitraum',
            generated: 'Generiert am',
            totalIncome: 'Gesamteinnahmen',
            totalExpense: 'Gesamtausgaben',
            annualBalance: 'Jahressaldo',
            monthlyBalance: 'Monatssaldo',
            date: 'Datum',
            concept: 'Konzept',
            type: 'Typ',
            category: 'Kategorie',
            amount: 'Betrag',
            income: 'Einnahme',
            expense: 'Ausgabe',
            footer: 'Offizieller Bericht der Kirchenkasse - Lokal und privat generiert.',
            transactionsTitle: 'Transaktionen des Zeitraums',
            months: ['Januar', 'Februar', 'Marz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
        }
    };
    
    const trans = translations[currentLang] || translations.es;
    
    // Filtrar y ordenar
    const filtered = transactions.filter(t => {
        if (!t.fecha) return false;
        const [year, month] = t.fecha.split('-').map(Number);
        return year === selYear && (isAllMonths || (month - 1) === selMonth);
    });
    
    if (filtered.length === 0) {
        showToast(isAllMonths ? trans.noTransactionsYear : trans.noTransactionsMonth, 'error');
        return;
    }
    
    // Ordenar por fecha ascendente
    filtered.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Calcular totales
    let totalIncome = 0;
    let totalExpense = 0;
    filtered.forEach(t => {
        const m = parseFloat(t.monto) || 0;
        if (t.tipo === 'ingreso') totalIncome += m;
        else if (t.tipo === 'gasto') totalExpense += m;
    });
    const balance = totalIncome - totalExpense;
    
    const dateToday = getTodayString().split('-').reverse().join('/');
    
    let tContentHTML = '';
    let tableRows = '';
    
    if (isAllMonths) {
        // Agrupar por mes
        const tExpensesByMonth = {};
        filtered.forEach(t => {
            const [year, month] = t.fecha.split('-').map(Number);
            const monthKey = month - 1;
            if (!tExpensesByMonth[monthKey]) {
                tExpensesByMonth[monthKey] = [];
            }
            tExpensesByMonth[monthKey].push(t);
        });
        
        const sortedTMonthKeys = Object.keys(tExpensesByMonth).map(Number).sort((a, b) => a - b);
        
        sortedTMonthKeys.forEach(mKey => {
            const monthTransactions = tExpensesByMonth[mKey];
            monthTransactions.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            
            let monthRows = '';
            monthTransactions.forEach(t => {
                const isIncome = t.tipo === 'ingreso';
                monthRows += `
                    <tr>
                        <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;">${formatDateString(t.fecha)}</td>
                        <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;">${t.concepto}</td>
                        <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;"><span class="print-badge print-badge-${t.tipo}">${isIncome ? trans.income : trans.expense}</span></td>
                        <td style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt;">${t.categoria || '-'}</td>
                        <td class="${isIncome ? 'print-td-income' : 'print-td-expense'}" style="padding:8px; border-bottom:1px solid #dddddd; font-size:9pt; text-align:right;">
                            ${isIncome ? '+' : '-'} ${formatCurrency(t.monto).replace('RD$', 'RD$ ')}
                        </td>
                    </tr>
                `;
            });
            
            tContentHTML += `
                <div class="print-month-section" style="margin-top: 30px; page-break-inside: avoid;">
                    <h2 style="font-size: 14pt; font-weight: 700; color: #0052cc; border-bottom: 2px solid #0052cc; padding-bottom: 5px; margin-bottom: 15px;">
                        ${trans.months[mKey]} ${selYear}
                    </h2>
                    <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                        <thead>
                            <tr style="background-color: #f8f9fa;">
                                <th style="padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:left;">Fecha</th>
                                <th style="padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:left;">Concepto</th>
                                <th style="padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:left;">Tipo</th>
                                <th style="padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:left;">Categoria</th>
                                <th style="padding: 6px 8px; border-bottom: 1px solid #dddddd; font-size: 8.5pt; font-weight: 600; text-align:right;">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${monthRows}
                        </tbody>
                    </table>
                </div>
            `;
        });
    } else {
        filtered.forEach(t => {
            const isIncome = t.tipo === 'ingreso';
            tableRows += `
                <tr>
                    <td>${formatDateString(t.fecha)}</td>
                    <td>${t.concepto}</td>
                    <td><span class="print-badge print-badge-${t.tipo}">${isIncome ? trans.income : trans.expense}</span></td>
                    <td>${t.categoria || '-'}</td>
                    <td class="${isIncome ? 'print-td-income' : 'print-td-expense'}" style="text-align:right;">
                        ${isIncome ? '+' : '-'} ${formatCurrency(t.monto).replace('RD$', 'RD$ ')}
                    </td>
                </tr>
            `;
        });
        
        tContentHTML = `
            <div class="print-section-title">${trans.transactionsTitle}</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>${trans.date}</th>
                        <th>${trans.concept}</th>
                        <th>${trans.type}</th>
                        <th>${trans.category}</th>
                        <th style="text-align:right;">${trans.amount}</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }
    
    const reportTitle = isAllMonths ? trans.annualReport : trans.monthlyReport;
    const periodText = isAllMonths ? `${trans.period}: ${selYear}` : `${trans.months[selMonth]} ${selYear}`;
    const balanceLabel = isAllMonths ? trans.annualBalance : trans.monthlyBalance;
    
    // Detectar si es dispositivo movil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                     || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
    
    if (isMobile) {
        // === MoVIL: Abrir ventana nueva con documento HTML completo e independiente ===
        const reportHTML = `<!DOCTYPE html>
<html lang="${currentLang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Poppins', system-ui, -apple-system, sans-serif;
            background-color: #ffffff;
            color: #000000;
            padding: 20px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .print-report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #000000;
            padding-bottom: 15px;
            margin-bottom: 25px;
        }
        .print-report-header h1 {
            font-size: 20pt;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .print-report-header p {
            font-size: 10pt;
            color: #555555;
        }
        .print-report-header-right {
            text-align: right;
            flex-shrink: 0;
        }
        .print-date {
            font-size: 12pt;
            font-weight: 600;
        }
        .print-subtitle {
            font-size: 9pt;
            color: #666666;
            margin-top: 4px;
        }
        .print-summary-grid {
            display: flex;
            justify-content: space-between;
            gap: 15px;
            margin-bottom: 30px;
        }
        .print-summary-card {
            flex: 1;
            border: 1px solid #dddddd;
            padding: 12px;
            border-radius: 6px;
            background-color: #fafafa;
        }
        .print-summary-card h3 {
            font-size: 9pt;
            color: #555555;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .print-summary-card .amount {
            font-size: 14pt;
            font-weight: 700;
        }
        .print-card-income .amount { color: #00875a; }
        .print-card-expense .amount { color: #de350b; }
        .print-card-balance .amount { color: #0052cc; }
        .print-section-title {
            font-size: 14pt;
            font-weight: 600;
            margin-bottom: 10px;
            border-bottom: 1px solid #dddddd;
            padding-bottom: 5px;
        }
        .print-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        .print-table th,
        .print-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #dddddd;
            font-size: 10pt;
            text-align: left;
        }
        .print-table th {
            font-weight: 600;
            background-color: #f0f0f0;
        }
        .print-badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 8pt;
            font-weight: 600;
            text-transform: uppercase;
            border: 1px solid #cccccc;
        }
        .print-badge-ingreso { background-color: #e3fcef; color: #006644; border-color: #abf5d1; }
        .print-badge-gasto { background-color: #ffebe6; color: #bf2600; border-color: #ffbdad; }
        .print-td-income { color: #006644; font-weight: 600; }
        .print-td-expense { color: #bf2600; font-weight: 600; }
        .print-report-footer {
            border-top: 1px dashed #cccccc;
            padding-top: 15px;
            text-align: center;
            font-size: 8pt;
            color: #777777;
            margin-top: 40px;
        }
        @media print {
            body { padding: 0; }
        }
        /* Ocultar widgets y elementos de traduccion inyectados por el navegador */
        .skiptranslate,
        #google_translate_element,
        .goog-te-banner-frame,
        .goog-te-balloon-frame,
        .goog-te-balloon,
        .goog-tooltip,
        .goog-tooltip-responsive,
        #goog-gt-tt,
        iframe,
        iframe[class*="goog"],
        div[class*="goog"],
        [class*="translate-"],
        .translation- {
            display: none !important;
            height: 0 !important;
            width: 0 !important;
            visibility: hidden !important;
            opacity: 0 !important;
        }
    </style>
</head>
<body>
    <div class="print-report-header">
        <div class="print-report-header-left">
            <h1>${reportTitle}</h1>
            <p>${trans.subtitle}</p>
        </div>
        <div class="print-report-header-right">
            <div class="print-date">${isAllMonths ? periodText : `${trans.period}: ${periodText}`}</div>
            <div class="print-subtitle">${trans.generated}: ${dateToday}</div>
        </div>
    </div>
    
    <div class="print-summary-grid">
        <div class="print-summary-card print-card-income">
            <h3>${trans.totalIncome}</h3>
            <div class="amount">${formatCurrency(totalIncome).replace('RD$', 'RD$ ')}</div>
        </div>
        <div class="print-summary-card print-card-expense">
            <h3>${trans.totalExpense}</h3>
            <div class="amount">${formatCurrency(totalExpense).replace('RD$', 'RD$ ')}</div>
        </div>
        <div class="print-summary-card print-card-balance">
            <h3>${balanceLabel}</h3>
            <div class="amount">${formatCurrency(balance).replace('RD$', 'RD$ ')}</div>
        </div>
    </div>
    
    ${tContentHTML}
    
    <div class="print-report-footer">
        <p>${trans.footer}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 400);
        };
    </script>
</body>
</html>`;
        
        const reportWindow = window.open('', '_blank');
        if (reportWindow) {
            reportWindow.document.write(reportHTML);
            reportWindow.document.close();
            showToast('Reporte generado. Se abrio en una nueva pestana.', 'success');
        } else {
            // Fallback si el navegador bloquea pop-ups
            const blob = new Blob([reportHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.click();
            URL.revokeObjectURL(url);
            showToast('Reporte generado. Si no se abrio, permite las ventanas emergentes.', 'info');
        }
        
    } else {
        // === PC/ESCRITORIO: Metodo original directo con window.print() ===
        const printContainer = document.getElementById('print-report-container');
        printContainer.innerHTML = `
            <div class="print-report-wrapper">
                <div class="print-report-header">
                    <div class="print-report-header-left">
                        <h1>${reportTitle}</h1>
                        <p>${trans.subtitle}</p>
                    </div>
                    <div class="print-report-header-right">
                        <div class="print-date">${isAllMonths ? periodText : `${trans.period}: ${periodText}`}</div>
                        <div class="print-subtitle">${trans.generated}: ${dateToday}</div>
                    </div>
                </div>
                
                <div class="print-summary-grid">
                    <div class="print-summary-card print-card-income">
                        <h3>${trans.totalIncome}</h3>
                        <div class="amount">${formatCurrency(totalIncome).replace('RD$', 'RD$ ')}</div>
                    </div>
                    <div class="print-summary-card print-card-expense">
                        <h3>${trans.totalExpense}</h3>
                        <div class="amount">${formatCurrency(totalExpense).replace('RD$', 'RD$ ')}</div>
                    </div>
                    <div class="print-summary-card print-card-balance">
                        <h3>${balanceLabel}</h3>
                        <div class="amount">${formatCurrency(balance).replace('RD$', 'RD$ ')}</div>
                    </div>
                </div>
                
                ${tContentHTML}
                
                <div class="print-report-footer">
                    <p>${trans.footer}</p>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            window.print();
            printContainer.innerHTML = '';
        }, 100);
        
        showToast('Di!logo de impresion (PDF) abierto.', 'success');
    }
}

// 4. Importar Respaldo (Seleccion y Parseo)
function handleImportCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validar extension
    if (!file.name.endsWith('.csv')) {
        showToast('El archivo seleccionado debe ser de formato CSV.', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        parseAndValidateCsv(text);
    };
    reader.onerror = function() {
        showToast('Error al leer el archivo seleccionado.', 'error');
    };
    reader.readAsText(file, 'UTF-8');
}

function parseAndValidateCsv(content) {
    parsedCsvTransactionsToImport = [];
    
    // Separar lineas limpiando retornos de carro
    const lines = content.split(/\r?\n/);
    if (lines.length < 2) {
        showToast('El archivo CSV est! vacio o incompleto.', 'error');
        return;
    }
    
    // Analizar encabezado (primera linea)
    // Buscamos: fecha,concepto,tipo,categoria,monto
    const headerLine = lines[0].replace(/^\uFEFF/, '').trim().toLowerCase(); // Quitar BOM
    const headers = headerLine.split(',');
    
    if (headers.length !== 5) {
        showToast('Formato de CSV inv!lido. Debe contener exactamente 5 columnas.', 'error');
        return;
    }
    
    let errorCount = 0;
    let validCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Saltar lineas vacias
        
        const row = splitCsvLine(line);
        if (row.length !== 5) {
            errorCount++;
            continue;
        }
        
        const [fecha, concepto, tipo, categoria, montoRaw] = row.map(s => s.trim());
        const monto = parseFloat(montoRaw);
        const tipoNorm = tipo.toLowerCase();
        
        // Validaciones individuales de datos
        const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
        const isConceptValid = concepto.length > 0;
        const isTypeValid = tipoNorm === 'ingreso' || tipoNorm === 'gasto';
        const isCategoryValid = categoria.length > 0;
        const isAmountValid = !isNaN(monto) && monto > 0;
        
        if (isDateValid && isConceptValid && isTypeValid && isCategoryValid && isAmountValid) {
            parsedCsvTransactionsToImport.push({
                id: 't-' + (Date.now() + i) + '-' + Math.random().toString(36).substr(2, 9),
                fecha: fecha,
                concepto: concepto,
                tipo: tipoNorm,
                categoria: categoria,
                monto: monto,
                createdAt: new Date().toISOString()
            });
            validCount++;
        } else {
            errorCount++;
        }
    }
    
    if (validCount === 0) {
        showToast('No se encontraron transacciones v!lidas en el archivo.', 'error');
        parsedCsvTransactionsToImport = [];
        return;
    }
    
    // Preparar texto de estadisticas en el modal
    let statsMessage = `Se encontraron <strong>${validCount}</strong> transacciones v!lidas para importar.`;
    if (errorCount > 0) {
        statsMessage += `<br><span style="color: var(--expense-color);">Se omitieron <strong>${errorCount}</strong> filas debido a errores de formato.</span>`;
    }
    statsMessage += `<br><br>?Est!s seguro de que deseas proceder? Los datos actuales del navegador ser!n reemplazados por completo.`;
    
    importStatsText.innerHTML = statsMessage;
    openModal(modalImport);
}

async function executeImportCsv() {
    if (parsedCsvTransactionsToImport.length === 0) return;
    
    transactions = parsedCsvTransactionsToImport;
    
    const colRef = getTreasuryCollectionRef();
    if (colRef) {
        try {
            for (let i = 0; i < transactions.length; i += 400) {
                const batch = writeBatch(db);
                const chunk = transactions.slice(i, i + 400);
                chunk.forEach(t => {
                    const docRef = doc(colRef, t.id);
                    batch.set(docRef, sanitizeData(t), { merge: true });
                });
                await batch.commit();
            }
        } catch (e) {
            console.error("Error importando lote a subcolección de tesorería:", e);
        }
    }
    
    await saveTransactionsMetadata();
    
    localStorage.setItem('ultimaImportacion', new Date().toISOString());
    
    const now = new Date();
    initFilters();
    
    closeModal(modalImport);
    showToast('Datos importados correctamente.', 'success');
    parsedCsvTransactionsToImport = [];
    
    render();
}


// --- MODALES (MOSTRAR Y OCULTAR) ---

function openModal(modalEl) {
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
}

function closeModal(modalEl) {
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
}

// --- UTILIDADES ---

function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatCurrency(amount) {
    const val = parseFloat(amount);
    if (isNaN(val)) return 'RD$0.00';
    return 'RD$' + val.toLocaleString('es-DO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDateString(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    // Retorna DD/MM/YYYY
    return `${day}/${month}/${year}`;
}

function escapeCSVField(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    // Si contiene comas o comillas dobles, escapar
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// Parsea una linea de CSV teniendo en cuenta campos con comillas y comas internas
function splitCsvLine(line) {
    const result = [];
    let curVal = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            // Verificar si es comilla doble escapada
            if (inQuotes && line[i + 1] === '"') {
                curVal += '"';
                i++; // Saltar la siguiente comilla
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(curVal);
            curVal = '';
        } else {
            curVal += char;
        }
    }
    result.push(curVal);
    return result;
}

// Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Iconos para toast
    let svgIcon = '';
    if (type === 'success') {
        svgIcon = `
            <svg class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--income-color);">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        `;
    } else if (type === 'error') {
        svgIcon = `
            <svg class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--expense-color);">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        `;
    } else {
        svgIcon = `
            <svg class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--primary-color);">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
        `;
    }
    
    toast.innerHTML = `
        ${svgIcon}
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Desvanecer y remover despues de 3s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                container.removeChild(toast);
            }
        }, 400);
    }, 3000);
}

// --- SISTEMA DE CATEGORiAS PERSONALIZABLES ---

function renderCategoryDatalists() {
    const tDatalist = document.getElementById('t-category-list');
    if (tDatalist) {
        tDatalist.innerHTML = '';
        treasuryCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.name;
            tDatalist.appendChild(opt);
        });
    }
    
    const pfDatalist = document.getElementById('pf-category-list');
    if (pfDatalist) {
        pfDatalist.innerHTML = '';
        personalCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.name;
            pfDatalist.appendChild(opt);
        });
    }
}

function renderCategoryManagerList() {
    const listContainer = document.getElementById('mc-category-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const currentList = currentCategoryModule === 'tesoreria' ? treasuryCategories : personalCategories;
    
    if (currentList.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 9.5pt; padding: 15px 0;">No hay categorias configuradas.</p>';
        return;
    }
    
    currentList.forEach((cat, idx) => {
        const row = document.createElement('div');
        row.className = 'category-item-row';
        
        row.innerHTML = `
            <div class="category-item-left">
                <div class="category-color-dot" style="background-color: ${cat.color};"></div>
                <span class="category-item-name">${cat.name}</span>
            </div>
            <div class="category-item-actions">
                <button class="btn-cat-action btn-cat-edit" data-index="${idx}" title="Editar" type="button">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-cat-action btn-cat-delete" data-index="${idx}" title="Eliminar" type="button">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        listContainer.appendChild(row);
    });
    
    listContainer.querySelectorAll('.btn-cat-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            editCategoryInManager(idx);
        });
    });
    
    listContainer.querySelectorAll('.btn-cat-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            deleteCategoryInManager(idx);
        });
    });
}

function editCategoryInManager(idx) {
    const currentList = currentCategoryModule === 'tesoreria' ? treasuryCategories : personalCategories;
    const cat = currentList[idx];
    
    const nameInput = document.getElementById('mc-category-name');
    const indexInput = document.getElementById('mc-category-index');
    const formTitle = document.getElementById('mc-form-title');
    const submitBtnSpan = document.querySelector('#btn-mc-submit span');
    
    nameInput.value = cat.name;
    indexInput.value = idx;
    formTitle.textContent = 'Editar Categoria';
    submitBtnSpan.textContent = 'Guardar';
    
    selectMcColor(cat.color);
}

async function deleteCategoryInManager(idx) {
    const currentList = currentCategoryModule === 'tesoreria' ? treasuryCategories : personalCategories;
    const catName = currentList[idx].name;
    
    currentList.splice(idx, 1);
    
    if (currentCategoryModule === 'tesoreria') {
        treasuryCategories = currentList;
        await saveTransactions();
    } else {
        personalCategories = currentList;
        await savePersonalFinances();
    }
    
    resetMcForm();
    renderCategoryManagerList();
    renderCategoryDatalists();
    render();
    renderPersonalFinances();
    
    showToast(`Categoria "${catName}" eliminada con exito.`, 'success');
}

async function handleMcCategorySubmit(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('mc-category-name');
    const indexInput = document.getElementById('mc-category-index');
    const colorInput = document.getElementById('mc-selected-color');
    
    const name = nameInput.value.trim();
    const color = colorInput.value;
    const idx = parseInt(indexInput.value);
    
    if (!name) return;
    
    const currentList = currentCategoryModule === 'tesoreria' ? treasuryCategories : personalCategories;
    
    const exists = currentList.some((cat, i) => cat.name.toLowerCase() === name.toLowerCase() && i !== idx);
    if (exists) {
        showToast('Ya existe una categoria con ese nombre.', 'error');
        return;
    }
    
    if (idx === -1) {
        currentList.push({ name, color });
        showToast(`Categoria "${name}" agregada con exito.`, 'success');
    } else {
        const oldName = currentList[idx].name;
        currentList[idx] = { name, color };
        
        if (currentCategoryModule === 'tesoreria') {
            transactions.forEach(t => {
                if (t.categoria === oldName) t.categoria = name;
            });
        } else {
            personalExpenses.forEach(pe => {
                if (pe.categoria === oldName) pe.categoria = name;
            });
        }
        showToast(`Categoria "${name}" actualizada con exito.`, 'success');
    }
    
    if (currentCategoryModule === 'tesoreria') {
        treasuryCategories = currentList;
        await saveTransactions();
    } else {
        personalCategories = currentList;
        await savePersonalFinances();
    }
    
    resetMcForm();
    renderCategoryManagerList();
    renderCategoryDatalists();
    render();
    renderPersonalFinances();
}

function resetMcForm() {
    const nameInput = document.getElementById('mc-category-name');
    const indexInput = document.getElementById('mc-category-index');
    const formTitle = document.getElementById('mc-form-title');
    const submitBtnSpan = document.querySelector('#btn-mc-submit span');
    
    if (nameInput) nameInput.value = '';
    if (indexInput) indexInput.value = '-1';
    if (formTitle) formTitle.textContent = 'Agregar Nueva Categoria';
    if (submitBtnSpan) submitBtnSpan.textContent = 'Agregar';
    
    const colors = [
        '#10b981', '#3b82f6', '#6366f1', '#7c3aed', 
        '#ec4899', '#ef4444', '#f97316', '#f59e0b', 
        '#eab308', '#14b8a6', '#06b6d4', '#6b7280'
    ];
    selectMcColor(colors[0]);
}

function renderMcColorPicker() {
    const colorGrid = document.getElementById('mc-color-grid');
    if (!colorGrid) return;
    
    colorGrid.innerHTML = '';
    const colors = [
        '#10b981', '#3b82f6', '#6366f1', '#7c3aed', 
        '#ec4899', '#ef4444', '#f97316', '#f59e0b', 
        '#eab308', '#14b8a6', '#06b6d4', '#6b7280'
    ];
    
    colors.forEach(col => {
        const circle = document.createElement('div');
        circle.className = 'color-circle';
        circle.style.backgroundColor = col;
        circle.setAttribute('data-color', col);
        
        circle.addEventListener('click', () => {
            selectMcColor(col);
        });
        
        colorGrid.appendChild(circle);
    });
}

function selectMcColor(color) {
    const selectedColorInput = document.getElementById('mc-selected-color');
    if (selectedColorInput) selectedColorInput.value = color;
    
    const colorGrid = document.getElementById('mc-color-grid');
    if (colorGrid) {
        colorGrid.querySelectorAll('.color-circle').forEach(circle => {
            if (circle.getAttribute('data-color') === color) {
                circle.classList.add('selected');
            } else {
                circle.classList.remove('selected');
            }
        });
    }
}

function renderPfCharts() {
    // Verificar si Chart.js est! cargado
    if (typeof Chart === 'undefined') return;
    
    // Obtener variables de periododo
    const isAllMonths = pfFilterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(pfFilterMonth.value);
    const selYear = parseInt(pfFilterYear.value);
    
    // ----------------------------------------------------
    // 1. CONFIGURACIoN DEL GRaFICO DE DONA (DONUT)
    // ----------------------------------------------------
    const donutCanvas = document.getElementById('pf-donut-chart');
    const donutEmpty = document.getElementById('pf-donut-empty');
    
    if (donutCanvas) {
        // Filtrar gastos del periododo seleccionado
        const currentPeriodExpenses = personalExpenses.filter(e => {
            if (!e.fecha) return false;
            const [y, m] = e.fecha.split('-').map(Number);
            return y === selYear && (isAllMonths || (m - 1) === selMonth);
        });
        
        // Destruir instancia anterior si existe
        if (pfDonutChartInstance) {
            pfDonutChartInstance.destroy();
            pfDonutChartInstance = null;
        }
        
        if (currentPeriodExpenses.length === 0) {
            if (donutEmpty) donutEmpty.classList.remove('hidden-element');
            donutCanvas.style.display = 'none';
        } else {
            if (donutEmpty) donutEmpty.classList.add('hidden-element');
            donutCanvas.style.display = 'block';
            
            // Agrupar por categoria
            const grouped = {};
            currentPeriodExpenses.forEach(e => {
                const catName = e.categoria || 'Otros';
                const amt = parseFloat(e.monto) || 0;
                grouped[catName] = (grouped[catName] || 0) + amt;
            });
            
            const categories = Object.keys(grouped);
            const values = Object.values(grouped);
            
            // Obtener colores
            const colors = categories.map(catName => {
                const found = personalCategories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                return found ? found.color : '#6b7280';
            });
            
            const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#ffffff';
            const cardBgColor = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#ffffff';
            
            const ctxDonut = donutCanvas.getContext('2d');
            pfDonutChartInstance = new Chart(ctxDonut, {
                type: 'doughnut',
                data: {
                    labels: categories,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: cardBgColor
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: textColor,
                                font: {
                                    size: 10,
                                    family: 'Poppins'
                                },
                                boxWidth: 10,
                                padding: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const val = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = ((val / total) * 100).toFixed(1);
                                    return ` RD$ ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} (${pct}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    }
    
    // ----------------------------------------------------
    // 2. CONFIGURACIoN DEL GRaFICO DE BARRAS COMPARATIVO
    // ----------------------------------------------------
    const barCanvas = document.getElementById('pf-bar-chart');
    if (barCanvas) {
        if (pfBarChartInstance) {
            pfBarChartInstance.destroy();
            pfBarChartInstance = null;
        }
        
        // Calcular ingresos y gastos mensuales para el aio seleccionado
        const monthlyIncomes = Array(12).fill(0);
        const monthlyExpenses = Array(12).fill(0);
        
        // Cargar ingresos mensuales
        for (let m = 0; m < 12; m++) {
            const monthStr = String(m + 1).padStart(2, '0');
            const key = `${selYear}-${monthStr}`;
            monthlyIncomes[m] = parseFloat(personalIncomes[key]) || 0;
        }
        
        // Cargar gastos mensuales (agrupados por mes)
        personalExpenses.forEach(e => {
            if (!e.fecha) return;
            const [y, m] = e.fecha.split('-').map(Number);
            if (y === selYear) {
                const mIdx = m - 1;
                if (mIdx >= 0 && mIdx < 12) {
                    monthlyExpenses[mIdx] += parseFloat(e.monto) || 0;
                }
            }
        });
        
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#ffffff';
        const textMuted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888888';
        const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#333333';
        
        const ctxBar = barCanvas.getContext('2d');
        pfBarChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
                datasets: [
                    {
                        label: 'Presupuesto',
                        data: monthlyIncomes,
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    },
                    {
                        label: 'Gastos',
                        data: monthlyExpenses,
                        backgroundColor: '#ef4444',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: {
                                size: 10,
                                family: 'Poppins'
                              },
                            boxWidth: 10,
                            padding: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.raw;
                                return ` ${context.dataset.label}: RD$ ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textMuted,
                            font: { size: 9, family: 'Poppins' }
                        }
                    },
                    y: {
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textMuted,
                            font: { size: 9, family: 'Poppins' },
                            callback: function(val) {
                                return val >= 1000 ? (val / 1000) + 'k' : val;
                            }
                        }
                    }
                }
            }
        });
    }
}

function closePfAutocomplete() {
    if (pfAutocompleteList) {
        pfAutocompleteList.innerHTML = '';
    }
}

function handlePfConceptInput() {
    const val = pfConcept.value;
    const valNorm = normalizeText(val);
    closePfAutocomplete();
    
    if (!valNorm) {
        if (!userEditedPfCategory) {
            if (pfCategory) pfCategory.value = '';
        }
        return;
    }
    
    // Obtener conceptos unicos de los valores por defecto
    const conceptMap = new Map();
    DEFAULT_PF_CONCEPT_CATEGORIES.forEach(item => {
        conceptMap.set(normalizeText(item.concepto), {
            original: item.concepto,
            categoria: item.categoria
        });
    });
    
    // Historial de gastos reales de Finanzas Personales
    personalExpenses.forEach(e => {
        const conceptNorm = e.concepto.trim();
        if (conceptNorm) {
            conceptMap.set(normalizeText(conceptNorm), {
                original: conceptNorm,
                categoria: e.categoria || ''
            });
        }
    });
    
    const uniqueConcepts = Array.from(conceptMap.values()).filter(x => x.categoria);
    
    // Buscar coincidencias parciales con el texto normalizado
    const matches = uniqueConcepts.filter(item => 
        normalizeText(item.original).includes(valNorm)
    ).slice(0, 5); // M!ximo 5 sugerencias
    
    if (matches.length > 0) {
        matches.forEach(match => {
            const div = document.createElement('div');
            
            // Resaltar el fragmento coincidente
            const origLower = match.original.toLowerCase();
            const valLower = val.toLowerCase();
            const index = origLower.indexOf(valLower);
            
            if (index !== -1) {
                const before = match.original.substring(0, index);
                const matchText = match.original.substring(index, index + val.length);
                const after = match.original.substring(index + val.length);
                div.innerHTML = `${before}<strong>${matchText}</strong>${after}`;
            } else {
                div.textContent = match.original;
            }
            
            div.addEventListener('click', () => {
                pfConcept.value = match.original;
                if (pfCategory) pfCategory.value = match.categoria;
                userEditedPfCategory = false; // Resetear bandera
                closePfAutocomplete();
                showToast('Categoria autocompletada', 'info');
            });
            
            pfAutocompleteList.appendChild(div);
        });
    }
    
    // Autocompletado directo en el campo categoria por palabras clave
    if (!userEditedPfCategory && pfCategory) {
        const bestMatch = uniqueConcepts.find(item => normalizeText(item.original).startsWith(valNorm)) ||
                          uniqueConcepts.find(item => normalizeText(item.original).includes(valNorm));
        
        if (bestMatch) {
            pfCategory.value = bestMatch.categoria;
        } else {
            let matchedCategoryByKeyword = null;
            for (const rule of KEYWORD_PF_CATEGORY_RULES) {
                const found = rule.keywords.some(kw => valNorm.includes(normalizeText(kw)));
                if (found) {
                    matchedCategoryByKeyword = rule.categoria;
                    break;
                }
            }
            
            if (matchedCategoryByKeyword) {
                pfCategory.value = matchedCategoryByKeyword;
            }
        }
    }
}

function renderTCharts() {
    // Verificar si Chart.js est! cargado
    if (typeof Chart === 'undefined') return;
    
    // Obtener variables de periododo
    const isAllMonths = filterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(filterMonth.value);
    const selYear = parseInt(filterYear.value);
    
    // ----------------------------------------------------
    // 1. CONFIGURACIoN DEL GRaFICO DE DONA (DONUT)
    // ----------------------------------------------------
    const donutCanvas = document.getElementById('t-donut-chart');
    const donutEmpty = document.getElementById('t-donut-empty');
    
    if (donutCanvas) {
        // Filtrar transacciones de gastos del periododo seleccionado
        const currentPeriodExpenses = transactions.filter(t => {
            if (!t.fecha || t.tipo !== 'gasto') return false;
            const [y, m] = t.fecha.split('-').map(Number);
            return y === selYear && (isAllMonths || (m - 1) === selMonth);
        });
        
        // Destruir instancia anterior si existe
        if (tDonutChartInstance) {
            tDonutChartInstance.destroy();
            tDonutChartInstance = null;
        }
        
        if (currentPeriodExpenses.length === 0) {
            if (donutEmpty) donutEmpty.classList.remove('hidden-element');
            donutCanvas.style.display = 'none';
        } else {
            if (donutEmpty) donutEmpty.classList.add('hidden-element');
            donutCanvas.style.display = 'block';
            
            // Agrupar por categoria
            const grouped = {};
            currentPeriodExpenses.forEach(t => {
                const catName = t.categoria || 'Otros';
                const amt = parseFloat(t.monto) || 0;
                grouped[catName] = (grouped[catName] || 0) + amt;
            });
            
            const categories = Object.keys(grouped);
            const values = Object.values(grouped);
            
            // Obtener colores
            const colors = categories.map(catName => {
                const found = treasuryCategories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                return found ? found.color : '#6b7280';
            });
            
            const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#ffffff';
            const cardBgColor = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#ffffff';
            
            const ctxDonut = donutCanvas.getContext('2d');
            tDonutChartInstance = new Chart(ctxDonut, {
                type: 'doughnut',
                data: {
                    labels: categories,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: cardBgColor
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: textColor,
                                font: {
                                    size: 10,
                                    family: 'Poppins'
                                },
                                boxWidth: 10,
                                padding: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const val = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = ((val / total) * 100).toFixed(1);
                                    return ` RD$ ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} (${pct}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    }
    
    // ----------------------------------------------------
    // 2. CONFIGURACIoN DEL GRaFICO DE LiNEA DE TENDENCIA
    // ----------------------------------------------------
    const barCanvas = document.getElementById('t-bar-chart');
    if (barCanvas) {
        if (tBarChartInstance) {
            tBarChartInstance.destroy();
            tBarChartInstance = null;
        }
        
        // Calcular ingresos y gastos mensuales para el aio seleccionado
        const monthlyNet = Array(12).fill(0);
        
        // Cargar montos mensuales de transacciones (Ingresos - Gastos)
        transactions.forEach(t => {
            if (!t.fecha) return;
            const [y, m] = t.fecha.split('-').map(Number);
            if (y === selYear) {
                const mIdx = m - 1;
                if (mIdx >= 0 && mIdx < 12) {
                    const amt = parseFloat(t.monto) || 0;
                    if (t.tipo === 'ingreso') {
                        monthlyNet[mIdx] += amt;
                    } else if (t.tipo === 'gasto') {
                        monthlyNet[mIdx] -= amt;
                    }
                }
            }
        });
        
        // Calcular el balance acumulado mes a mes
        const cumulativeBalances = [];
        let runningSum = 0;
        for (let m = 0; m < 12; m++) {
            runningSum += monthlyNet[m];
            cumulativeBalances.push(runningSum);
        }
        
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#ffffff';
        const textMuted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888888';
        const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#333333';
        
        const ctxBar = barCanvas.getContext('2d');
        
        // Crear gradiente de fondo
        const gradient = ctxBar.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.18)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.00)');
        
        tBarChartInstance = new Chart(ctxBar, {
            type: 'line',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
                datasets: [{
                    label: 'Balance Acumulado',
                    data: cumulativeBalances,
                    borderColor: '#3b82f6',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // Ocultar leyenda ya que es una sola serie de datos obvia
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.raw;
                                return ` Balance: RD$ ${val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textMuted,
                            font: { size: 9, family: 'Poppins' }
                        }
                    },
                    y: {
                        grid: {
                            color: borderColor
                        },
                        ticks: {
                            color: textMuted,
                            font: { size: 9, family: 'Poppins' },
                            callback: function(val) {
                                if (Math.abs(val) >= 1000) {
                                    return (val / 1000) + 'k';
                                }
                                return val;
                            }
                        }
                    }
                }
            }
        });
    }
}

// --- COPILOT DE FINANZAS PERSONALES LOGIC ---

function initCopilot() {
    const btnToggle = document.getElementById('btn-pf-copilot-toggle');
    const btnClose = document.getElementById('btn-copilot-close');
    const btnSettings = document.getElementById('btn-copilot-settings');
    const btnSaveKey = document.getElementById('btn-copilot-save-key');
    const inputKey = document.getElementById('copilot-api-key-input');
    const formInput = document.getElementById('copilot-input-form');
    const messageInput = document.getElementById('copilot-message-input');
    
    if (!btnToggle) return;
    
    // Inicializar clave API si no existe en localStorage
    if (!localStorage.getItem('copilot_api_key')) {
        localStorage.setItem('copilot_api_key', DEFAULT_GEMINI_KEY);
    }
    
    // Configurar valor del input con la clave guardada
    if (inputKey) {
        inputKey.value = localStorage.getItem('copilot_api_key') || '';
    }
    
    updateKeyStatusText();
    
    // Evento de abrir/cerrar chat
    btnToggle.addEventListener('click', toggleCopilotChat);
    
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            const container = document.getElementById('pf-copilot-container');
            if (container) container.classList.remove('active');
            
            const chatIcon = document.querySelector('.btn-pf-copilot-toggle .chat-icon');
            const closeIcon = document.querySelector('.btn-pf-copilot-toggle .close-icon');
            if (chatIcon) chatIcon.classList.remove('hidden-element');
            if (closeIcon) closeIcon.classList.add('hidden-element');
        });
    }
    
    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            const panel = document.getElementById('copilot-settings-panel');
            if (panel) panel.classList.toggle('hidden-element');
        });
    }
    
    if (btnSaveKey) {
        btnSaveKey.addEventListener('click', () => {
            const keyVal = inputKey.value.trim();
            if (keyVal) {
                localStorage.setItem('copilot_api_key', keyVal);
                showToast('Clave API guardada con exito.', 'success');
            } else {
                localStorage.removeItem('copilot_api_key');
                showToast('Clave API eliminada. Se usar! el motor local.', 'info');
            }
            updateKeyStatusText();
            const panel = document.getElementById('copilot-settings-panel');
            if (panel) panel.classList.add('hidden-element');
        });
    }
    
    if (formInput) {
        formInput.addEventListener('submit', handleCopilotSendMessage);
    }
    
    // Primer mensaje de bienvenida
    resetCopilotHistory();
}

function updateKeyStatusText() {
    const statusText = document.getElementById('copilot-key-status');
    if (!statusText) return;
    const currentKey = localStorage.getItem('copilot_api_key');
    if (currentKey) {
        statusText.textContent = " Clave API activa. Modo IA inteligente habilitado.";
        statusText.style.color = "#10b981"; // verde
    } else {
        statusText.textContent = "u Sin Clave API. Usando Modo Local b!sico.";
        statusText.style.color = "#f59e0b"; // naranja
    }
}

function toggleCopilotChat() {
    const container = document.getElementById('pf-copilot-container');
    if (!container) return;
    
    container.classList.toggle('active');
    
    const chatIcon = document.querySelector('.btn-pf-copilot-toggle .chat-icon');
    const closeIcon = document.querySelector('.btn-pf-copilot-toggle .close-icon');
    
    if (container.classList.contains('active')) {
        if (chatIcon) chatIcon.classList.add('hidden-element');
        if (closeIcon) closeIcon.classList.remove('hidden-element');
        
        // Scroll al fondo al abrir
        const messagesContainer = document.getElementById('copilot-messages-container');
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
    } else {
        if (chatIcon) chatIcon.classList.remove('hidden-element');
        if (closeIcon) closeIcon.classList.add('hidden-element');
    }
}

function updateCopilotVisibility() {
    const copilotContainer = document.getElementById('pf-copilot-container');
    if (!copilotContainer) return;
    
    if (currentUser && currentModule === 'personales') {
        copilotContainer.classList.remove('hidden-element');
        document.body.classList.add('has-copilot');
    } else {
        copilotContainer.classList.add('hidden-element');
        document.body.classList.remove('has-copilot');
        // Asegurar que el chat est! cerrado
        copilotContainer.classList.remove('active');
        const chatIcon = document.querySelector('.btn-pf-copilot-toggle .chat-icon');
        const closeIcon = document.querySelector('.btn-pf-copilot-toggle .close-icon');
        if (chatIcon) chatIcon.classList.remove('hidden-element');
        if (closeIcon) closeIcon.classList.add('hidden-element');
    }
    
    // Sincronizar tambien la visibilidad del boton de scroll-to-top
    updateScrollTopButtonVisibility();
}

function updateScrollTopButtonVisibility() {
    const btnScrollTop = document.getElementById('btn-scroll-top');
    if (!btnScrollTop) return;
    
    const isInsideModule = currentUser && (currentModule === 'tesoreria' || currentModule === 'personales');
    if (isInsideModule && window.scrollY > 300) {
        btnScrollTop.classList.add('visible');
    } else {
        btnScrollTop.classList.remove('visible');
    }
}

function resetCopilotHistory() {
    const container = document.getElementById('copilot-messages-container');
    if (!container) return;
    
    container.innerHTML = '';
    copilotMessages = [];
    
    const greetingText = `!Hola! Soy tu **Copilot de Finanzas Personales** a.
Puedo analizar tus ingresos y gastos registrados de este mes para darte consejos pr!cticos de ahorro y responder tus preguntas.

**Prueba a preguntarme:**
* *?Cu!l es mi saldo disponible?*
* *?Cu!nto dinero puedo gastar en salidas en base a mi saldo?*
* *?Cu!nto he gastado este mes y cu!nto tengo pendiente?*`;
    
    appendCopilotMessage('assistant', greetingText);
}

function appendCopilotMessage(sender, text) {
    const container = document.getElementById('copilot-messages-container');
    if (!container) return;
    
    removeTypingBubble();
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `copilot-message ${sender}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'copilot-message-bubble';
    
    // Parseo b!sico de negritas **texto** a <strong>texto</strong> y saltos de linea
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
        
    bubble.innerHTML = formattedText;
    
    const time = document.createElement('span');
    time.className = 'copilot-message-time';
    const now = new Date();
    time.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    msgDiv.appendChild(bubble);
    msgDiv.appendChild(time);
    container.appendChild(msgDiv);
    
    // Mantener scroll abajo
    container.scrollTop = container.scrollHeight;
}

function showTypingBubble() {
    const container = document.getElementById('copilot-messages-container');
    if (!container || document.getElementById('copilot-typing-bubble')) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'copilot-message assistant';
    msgDiv.id = 'copilot-typing-bubble';
    
    const bubble = document.createElement('div');
    bubble.className = 'copilot-message-bubble typing-bubble';
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        bubble.appendChild(dot);
    }
    
    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function removeTypingBubble() {
    const bubble = document.getElementById('copilot-typing-bubble');
    if (bubble) bubble.remove();
}

async function handleCopilotSendMessage(e) {
    e.preventDefault();
    
    const messageInput = document.getElementById('copilot-message-input');
    const sendBtn = document.getElementById('btn-pf-copilot-toggle');
    const messageForm = document.getElementById('copilot-input-form');
    
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    // Mostrar mensaje del usuario
    appendCopilotMessage('user', text);
    messageInput.value = '';
    messageInput.disabled = true;
    
    // Mostrar estado "escribiendo..."
    showTypingBubble();
    
    // Obtener data financiera del periodo seleccionado
    const isAllMonths = pfFilterMonth.value === 'all';
    const selMonth = isAllMonths ? null : parseInt(pfFilterMonth.value);
    const selYear = parseInt(pfFilterYear.value);
    
    // Filtrar gastos
    const filteredExpenses = personalExpenses.filter(e => {
        if (!e.fecha) return false;
        const [year, month] = e.fecha.split('-').map(Number);
        return year === selYear && (isAllMonths || (month - 1) === selMonth);
    });
    
    // Calcular totales
    let totalPaid = 0;
    let totalPending = 0;
    filteredExpenses.forEach(e => {
        const amt = parseFloat(e.monto) || 0;
        if (e.estado === 'pagado') {
            totalPaid += amt;
        } else {
            totalPending += amt;
        }
    });
    
    let currentIncome = 0;
    let periodName = "";
    if (isAllMonths) {
        periodName = `Todo el ano ${selYear}`;
        let annualSum = 0;
        Object.keys(personalIncomes).forEach(key => {
            if (key.startsWith(`${selYear}-`)) {
                annualSum += parseFloat(personalIncomes[key]) || 0;
            }
        });
        currentIncome = annualSum;
    } else {
        const monthsNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        periodName = `${monthsNames[selMonth]} ${selYear}`;
        const monthStr = String(selMonth + 1).padStart(2, '0');
        const periodKey = `${selYear}-${monthStr}`;
        currentIncome = parseFloat(personalIncomes[periodKey]) || 0.00;
    }
    
    const balance = currentIncome - totalPaid;
    const totalSpent = totalPaid + totalPending;
    
    const apiKey = localStorage.getItem('copilot_api_key');
    
    // Intentar responder
    try {
        if (apiKey) {
            // --- MODO INTELIGENTE CON GEMINI API ---
            
            // Mapear los gastos a una estructura compacta
            const expensesListCompact = filteredExpenses.map(e => ({
                concepto: e.concepto,
                monto: e.monto,
                tipo: e.tipo,
                estado: e.estado,
                fecha: e.fecha,
                categoria: e.categoria || 'Sin categoria'
            }));
            
            const systemPrompt = `Eres un asesor financiero personal experto e inteligente para el usuario.
Tu tarea es responder preguntas personalizadas sobre su presupuesto, ingresos, gastos y saldo restante para el periodo seleccionado.
A continuacion se proporciona la informacion financiera en tiempo real extraida del sistema de su navegador:
- Periodo seleccionado: ${periodName}
- Ingreso/Presupuesto del mes: RD$ ${currentIncome.toFixed(2)}
- Total Gastado (Ya Pagado): RD$ ${totalPaid.toFixed(2)}
- Total Pendiente por Pagar: RD$ ${totalPending.toFixed(2)}
- Saldo Disponible actual (Ingreso - Gastado Pagado): RD$ ${balance.toFixed(2)}
- Balance Restante Neto Total (Ingreso - Total Gastos): ${(currentIncome - totalSpent).toFixed(2)}
- Lista de Gastos registrados: ${JSON.stringify(expensesListCompact)}

Reglas de comportamiento:
1. Responde siempre en espanol, con un tono amable, profesional, conciso y motivador.
2. Da respuestas breves y directas, de m!ximo 3 o 4 oraciones a menos que te soliciten un desglose.
3. Utiliza el formato de moneda dominicana "RD$ X,XXX.XX" para los montos.
4. Si el usuario te pregunta cosas del tipo "?Cu!nto dinero puedo gastar en salidas en base a mi saldo disponible?", analiza:
   - Su saldo disponible actual.
   - Si tiene gastos pendientes de pago importantes (que reduzcan su margen real).
   - Recomienda un limite prudente para esa categoria (por ejemplo, destinar el 10-15% del saldo disponible para no comprometer el presupuesto) y justifica la respuesta con numeros.
5. Nunca aludas a datos que no existan en el contexto proporcionado ni inventes transacciones.
6. Si te preguntan sobre el modulo de Tesoreria, aclara de forma atenta que est!s disenado exclusivamente para responder sobre el modulo de Finanzas Personales.`;

            const reply = await callGeminiAPI(apiKey, systemPrompt, text);
            appendCopilotMessage('assistant', reply);
            
        } else {
            // --- MODO LOCAL BaSICO (REGLAS Y REGEX) ---
            
            // Simular pequena latencia para que se sienta interactivo
            await new Promise(resolve => setTimeout(resolve, 800));
            
            const lowerText = text.toLowerCase();
            let reply = "";
            
            if (lowerText.includes('saldo') || lowerText.includes('disponible') || lowerText.includes('balance') || lowerText.includes('cuanto tengo')) {
                reply = `Para el periodo **${periodName}**, tu presupuesto de ingresos es **${formatCurrency(currentIncome)}**.\n\n` + 
                        `Tu saldo disponible actual es **${formatCurrency(balance)}** (Ingreso mensual menos gastos ya pagados).\n` +
                        `Si consideras tambien los gastos pendientes (${formatCurrency(totalPending)}), tu balance restante neto al final del mes seria **${formatCurrency(currentIncome - totalSpent)}**.`;
                        
            } else if (lowerText.includes('gasto') || lowerText.includes('gastado') || lowerText.includes('gastos') || lowerText.includes('pagar')) {
                reply = `Durante **${periodName}**, tienes registrados un total de **${formatCurrency(totalSpent)}** en gastos:\n` +
                        `- **${formatCurrency(totalPaid)}** ya pagados (restados de tu saldo disponible).\n` +
                        `- **${formatCurrency(totalPending)}** pendientes de pago.`;
                        
            } else if (lowerText.includes('salida') || lowerText.includes('salidas') || lowerText.includes('comida') || lowerText.includes('supermercado') || lowerText.includes('entretenimiento') || lowerText.includes('gastar')) {
                // Recomendacion de salidas basada en el saldo
                const maxSalidasRecomendado = Math.max(0, balance * 0.15); // 15% del saldo disponible
                
                // Buscar si hay gastos previos en categorias de salidas o comida
                const gastosCategoria = filteredExpenses.filter(e => {
                    const cat = (e.categoria || '').toLowerCase();
                    const con = e.concepto.toLowerCase();
                    return cat.includes('salida') || cat.includes('comida') || cat.includes('supermercado') || cat.includes('entretenimiento') || con.includes('cine') || con.includes('cena') || con.includes('restaurante') || con.includes('salida');
                });
                
                const totalCategoria = gastosCategoria.reduce((sum, e) => sum + (parseFloat(e.monto) || 0), 0);
                
                reply = `Tu saldo disponible es **${formatCurrency(balance)}**. Te sugiero destinar como m!ximo un **15%** de este saldo para gastos discrecionales (salidas, comida fuera, entretenimiento), lo cual equivale a **${formatCurrency(maxSalidasRecomendado)}**.\n\n` +
                        `Actualmente tienes registrados **${formatCurrency(totalCategoria)}** en este tipo de conceptos este mes.\n\n` +
                        `*Recomendacion:* Si planeas salir, te sugiero un limite de **${formatCurrency(Math.max(0, maxSalidasRecomendado - totalCategoria))}** para no afectar el pago de tus gastos pendientes (${formatCurrency(totalPending)}).`;
                        
            } else if (lowerText.includes('ayuda') || lowerText.includes('hola') || lowerText.includes('buenos dias') || lowerText.includes('buenas tardes')) {
                reply = `!Hola! Estoy listo para ayudarte con tu presupuesto de **${periodName}**.\n\n` +
                        `Puedes hacerme preguntas sencillas sobre tu **'saldo'**, tus **'gastos'**, o pedirme recomendaciones de **'salidas'**.\n\n` +
                        `*Nota:* Para habilitar mi motor de Inteligencia Artificial avanzado (capaz de razonar logicamente sobre cualquier duda), por favor haz clic en el engranaje ui de arriba e introduce tu clave API de Gemini.`;
            } else {
                reply = `Entiendo tu consulta sobre tus finanzas en **${periodName}**, pero no puedo darte una respuesta detallada con mi motor local.\n\n` +
                        `**Por favor, configura tu API Key de Gemini** haciendo clic en el engranaje ui de la cabecera. Es gratuita y me permitir! usar inteligencia artificial avanzada para analizar detalladamente tu consulta y darte una recomendacion experta.`;
            }
            
            appendCopilotMessage('assistant', reply);
        }
    } catch (err) {
        removeTypingBubble();
        appendCopilotMessage('assistant', ` Ocurrio un error al procesar tu consulta: *${err.message}*.\n\nPor favor, verifica tu conexion a Internet o revisa que tu clave API de Gemini configurada sea correcta.`);
    } finally {
        messageInput.disabled = false;
        messageInput.focus();
    }
}

async function callGeminiAPI(apiKey, prompt, userMessage) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: prompt + "\n\nPregunta del usuario:\n" + userMessage }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1000
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE"
                }
            ]
        })
    });
    
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Error de API de Gemini:', errData);
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
        throw new Error('No se recibio texto del modelo.');
    }
    
    const responseText = parts.map(p => p.text).join('');
    return responseText.trim();
}

// --- SELECTOR DE IDIOMA PERSONALIZADO (GOOGLE TRANSLATE - COOKIE + RELOAD) ---

function getCurrentLangFromCookie() {
    const match = document.cookie.match(/googtrans=\/es\/([a-z]+)/);
    return (match && match[1] !== 'es') ? match[1] : 'es';
}

function changeGoogleTranslateLanguage(langCode) {
    // Escribir cookies en path raiz y dominio local
    document.cookie = `googtrans=/es/${langCode}; path=/;`;
    document.cookie = `googtrans=/es/${langCode}; path=/; domain=${window.location.hostname};`;

    // Mostrar un toast de aviso antes de recargar
    const langName = LANG_NAMES[langCode] || langCode.toUpperCase();
    showToast(`Aplicando idioma: ${langName}...`, 'info');

    // Pequeno delay para que el toast sea visible, luego recargar
    setTimeout(() => {
        window.location.reload();
    }, 600);
}

function syncLanguageSelectorUI() {
    const currentLangText = document.getElementById('current-lang-code');
    const options = document.querySelectorAll('.translate-option');
    if (!currentLangText) return false;

    const activeLang = getCurrentLangFromCookie();
    currentLangText.textContent = activeLang.toUpperCase();

    options.forEach(opt => {
        if (opt.getAttribute('data-lang') === activeLang) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
    return true;
}

function initCustomLanguageSelector() {
    const triggerBtn = document.getElementById('translate-trigger-btn');
    const dropdown = document.getElementById('custom-translate-dropdown');
    const options = document.querySelectorAll('.translate-option');

    if (!triggerBtn || !dropdown) return;

    // Sincronizar UI con el idioma activo (leido de la cookie)
    syncLanguageSelectorUI();

    triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        triggerBtn.setAttribute('aria-expanded', dropdown.classList.contains('active'));
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.getAttribute('data-lang');
            dropdown.classList.remove('active');
            triggerBtn.setAttribute('aria-expanded', 'false');
            changeGoogleTranslateLanguage(lang);
        });
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
            triggerBtn.setAttribute('aria-expanded', 'false');
        }
    });
}
