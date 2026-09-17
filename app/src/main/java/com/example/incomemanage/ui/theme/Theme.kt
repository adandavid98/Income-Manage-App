package com.example.incomemanage.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = BrandIndigoBright,
    onPrimary = DarkBackground,
    primaryContainer = BrandIndigo,
    onPrimaryContainer = DarkText,
    secondary = BalanceSky,
    tertiary = IncomeEmerald,
    background = DarkBackground,
    surface = DarkSurface,
    onBackground = DarkText,
    onSurface = DarkText,
    outline = DarkBorder
)

private val LightColorScheme = lightColorScheme(
    primary = BrandIndigo,
    onPrimary = LightSurface,
    primaryContainer = BrandIndigoBright,
    onPrimaryContainer = LightSurface,
    secondary = BalanceSky,
    tertiary = IncomeEmerald,
    background = LightBackground,
    surface = LightSurface,
    onBackground = LightText,
    onSurface = LightText,
    outline = LightBorder
)

@Composable
fun IncomeManageTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
