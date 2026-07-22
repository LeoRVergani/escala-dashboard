// Catálogo de seções da navegação principal do Dashboard (FASE 14E). Substitui o
// antigo alternador local `socView` — a seção ativa agora é a única fonte de verdade
// de qual conteúdo é mostrado, e persiste em localStorage do mesmo jeito que socView
// persistia antes.
export type AppSection =
  | 'home'
  | 'import'
  | 'planner'
  | 'grid'
  | 'demo'
  | 'official'
  | 'status'
  | 'admin'
  | 'settings';

export interface AppSectionMeta {
  key: AppSection;
  label: string;
  description: string;
}

export const APP_SECTIONS: AppSectionMeta[] = [
  { key: 'home', label: 'Início', description: 'Visão geral e atalhos' },
  { key: 'import', label: 'Importar escala', description: 'Planilha XLS/XLSX' },
  { key: 'planner', label: 'Planejador', description: 'Arrastar e soltar (SOC/NOC)' },
  { key: 'grid', label: 'Grade', description: 'Grade mensal editável' },
  { key: 'demo', label: 'Ambiente Demo', description: 'Workspace demo-v1' },
  { key: 'official', label: 'Publicação Oficial', description: 'Workspace ici-dev' },
  { key: 'status', label: 'Histórico/Status', description: 'Backend e revisões' },
  { key: 'admin', label: 'Administração', description: 'Perfis administrativos' },
  { key: 'settings', label: 'Configurações', description: 'Preferências locais' },
];

const ACTIVE_SECTION_KEY = 'escala-dashboard:active-section';
const NAV_COLLAPSED_KEY = 'escala-dashboard:nav-collapsed';
const UI_COMPACT_KEY = 'escala-dashboard:ui-compact';

export function isAppSection(value: string | null): value is AppSection {
  return APP_SECTIONS.some((section) => section.key === value);
}

export function loadStoredSection(): AppSection {
  const stored = localStorage.getItem(ACTIVE_SECTION_KEY);
  return isAppSection(stored) ? stored : 'home';
}

export function storeSection(section: AppSection): void {
  localStorage.setItem(ACTIVE_SECTION_KEY, section);
}

export function loadStoredNavCollapsed(): boolean {
  return localStorage.getItem(NAV_COLLAPSED_KEY) === 'true';
}

export function storeNavCollapsed(collapsed: boolean): void {
  localStorage.setItem(NAV_COLLAPSED_KEY, String(collapsed));
}

export function loadStoredUiCompact(): boolean {
  return localStorage.getItem(UI_COMPACT_KEY) === 'true';
}

export function storeUiCompact(compact: boolean): void {
  localStorage.setItem(UI_COMPACT_KEY, String(compact));
}
