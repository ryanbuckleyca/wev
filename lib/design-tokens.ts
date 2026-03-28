// Design Tokens - Single Source of Truth
// This file defines all design tokens used across the application

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 100,
  header: 200,
  modalOverlay: 300,
  modal: 310,
} as const

export const tokens = {
  // Background & Surface
  bg: '#FEFBF7',
  surface: '#ffffff',
  surfaceTint: '#F8F9FB',
  border: '#c8c5bf',

  // Text Colors
  textPrimary: '#2a2a2a',
  textSecondary: '#6b6b6b',
  textTertiary: '#7a7a7a',

  // Brand Colors
  primary: '#5B8C8A',
  primaryTint: '#D6EAEA',
  primaryText: '#5B8C8A',
  onPrimary: '#ffffff',

  accent: '#875C74',
  accentTint: '#f0e4ec',

  // Semantic Colors
  successSolid: '#3E8C4F',
  successTint: '#C5EBC3',
  successText: '#246633',

  alertSolid: '#C45A4A',
  alertTint: '#F2D0CC',
  alertText: '#9E3A2E',

  warnSolid: '#C4941A',
  warnTint: '#FEF3C7',
  warnText: '#7C5E10',

  infoSolid: '#4A7A9E',
  infoTint: '#C3D9EB',
  infoText: '#36607E',

  // Background Colors (for dark mode)
  gradientBg: '#ffffff',
  gradientLp: '#f0e4ec',
  gradientTl: '#D6EAEA',
  gradientMb: '#C3D9EB',

  // Watercolor Background Colors
  watercolorLavender: '#C895B3',
  watercolorBlue: '#B5C9ED',

  // Opacity Values
  lavenderOpacity: {
    light: 0.228,
    dark: 0.095
  },
  blueOpacity: {
    light: 0.2,
    dark: 0.08
  }
}

// Dark mode overrides
export const darkTokens = {
  ...tokens,
  bg: '#0d0d0d',
  surface: '#1a1a1a',
  surfaceTint: '#2a2a2a',
  border: '#404040',

  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
  textTertiary: '#999999',

  // Dark mode background colors
  gradientBg: '#0d0d0d',
  gradientLp: '#c96fa0',
  gradientTl: '#4eb8b8',
  gradientMb: '#5a9ec9'
}

// Helper functions
export const getTokens = (isDark = false) => isDark ? darkTokens : tokens

export const getOpacity = (color: 'lavender' | 'blue', isDark = false) => {
  if (color === 'lavender') {
    return isDark ? tokens.lavenderOpacity.dark : tokens.lavenderOpacity.light
  }
  return isDark ? tokens.blueOpacity.dark : tokens.blueOpacity.light
}
