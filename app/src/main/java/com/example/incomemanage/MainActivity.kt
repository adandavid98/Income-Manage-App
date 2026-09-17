package com.example.incomemanage

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.incomemanage.ui.components.AppHeader
import com.example.incomemanage.ui.screens.LoginScreen
import com.example.incomemanage.ui.screens.MainMenuScreen
import com.example.incomemanage.ui.screens.PersonalFinancesScreen
import com.example.incomemanage.ui.screens.TreasuryScreen
import com.example.incomemanage.ui.screens.actions.*
import com.example.incomemanage.ui.theme.IncomeManageTheme
import com.example.incomemanage.ui.viewmodel.AppScreen
import com.example.incomemanage.ui.viewmodel.FinanceViewModel
import kotlinx.coroutines.flow.collectLatest

class MainActivity : ComponentActivity() {

    private val viewModel: FinanceViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            val isDarkTheme by viewModel.isDarkTheme.collectAsState()
            val currentScreen by viewModel.currentScreen.collectAsState()
            val currentUser by viewModel.currentUser.collectAsState()
            val snackbarHostState = remember { SnackbarHostState() }

            // Hierarchical back handling
            BackHandler(enabled = viewModel.canGoBack()) {
                viewModel.handleBackNavigation()
            }

            // Snackbar listener
            LaunchedEffect(Unit) {
                viewModel.snackbarMessage.collectLatest { msg ->
                    if (msg != null) {
                        snackbarHostState.showSnackbar(msg)
                        viewModel.snackbarMessage.value = null
                    }
                }
            }

            IncomeManageTheme(darkTheme = isDarkTheme) {
                Scaffold(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("app_root"),
                    snackbarHost = { SnackbarHost(snackbarHostState) },
                    contentWindowInsets = WindowInsets.systemBars
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.background)
                            .padding(innerPadding)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Header bar
                            AppHeader(
                                currentScreen = currentScreen,
                                isDarkTheme = isDarkTheme,
                                currentUser = currentUser,
                                onToggleTheme = { viewModel.toggleTheme() },
                                onBack = { viewModel.handleBackNavigation() },
                                onHome = { viewModel.navigateTo(AppScreen.MENU) },
                                onSignOut = { viewModel.signOut() }
                            )

                            // Active Screen View
                            Box(modifier = Modifier.weight(1f)) {
                                when (currentScreen) {
                                    AppScreen.LOGIN -> {
                                        LoginScreen(
                                            viewModel = viewModel,
                                            onLoginSuccess = { viewModel.navigateTo(AppScreen.MENU) }
                                        )
                                    }
                                    AppScreen.MENU -> {
                                        MainMenuScreen(
                                            onSelectModule = { viewModel.navigateTo(it) }
                                        )
                                    }
                                    AppScreen.TREASURY -> {
                                        TreasuryScreen(viewModel = viewModel)
                                    }
                                    AppScreen.PERSONAL_FINANCES -> {
                                        PersonalFinancesScreen(viewModel = viewModel)
                                    }
                                    // Sub-Menus
                                    AppScreen.TREASURY_ACTIONS_MENU -> {
                                        ActionsMenuScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.PERSONAL_ACTIONS_MENU -> {
                                        ActionsMenuScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    // Dedicated Windows: Treasury
                                    AppScreen.TREASURY_REPORT -> {
                                        ReportActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_EXPORT -> {
                                        ExportActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_IMPORT -> {
                                        ImportActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_CATEGORIES -> {
                                        CategoriesActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_PASSPHRASE -> {
                                        PassphraseActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_LOGS -> {
                                        ActivityLogsActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_ARCHIVE -> {
                                        ArchiveYearActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    AppScreen.TREASURY_CLEAR -> {
                                        ClearDataActionScreen(viewModel = viewModel, isTreasury = true)
                                    }
                                    // Dedicated Windows: Personal
                                    AppScreen.PERSONAL_REPORT -> {
                                        ReportActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_EXPORT -> {
                                        ExportActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_IMPORT -> {
                                        ImportActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_CATEGORIES -> {
                                        CategoriesActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_PASSPHRASE -> {
                                        PassphraseActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_LOGS -> {
                                        ActivityLogsActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_ARCHIVE -> {
                                        ArchiveYearActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_CLEAR -> {
                                        ClearDataActionScreen(viewModel = viewModel, isTreasury = false)
                                    }
                                    AppScreen.PERSONAL_COPILOT -> {
                                        CopilotActionScreen(viewModel = viewModel)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
