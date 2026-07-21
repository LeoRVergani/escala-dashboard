// Tema claro/escuro (FASE 14E, adendo de UX). O escuro reaproveita a paleta real do app
// Android/KMP (EscalaICI-KMP-Lab, `ui/theme/LabColors.kt`, dark-only) para os dois lados do
// produto ficarem visualmente consistentes; o claro continua sendo a paleta já existente
// deste Dashboard (só o `--action` foi alinhado ao mesmo verde usado como `tertiary` no
// app KMP). Nenhuma cor real de dado (nome, e-mail, tenant) está aqui - são só tokens de UI.
export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'escala-dashboard:theme';

export function loadStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function storeTheme(preference: ThemePreference): void {
  localStorage.setItem(THEME_KEY, preference);
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    if (typeof window.matchMedia !== 'function') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  }
  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(preference));
}

export function nextTheme(current: ThemePreference): ThemePreference {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}
