import { useRef, useState, type ReactNode } from 'react';
import { APP_SECTIONS, type AppSection } from '../lib/navigation';
import type { ThemePreference } from '../lib/theme';
import { CloseIcon, CollapseLeftIcon, CollapseRightIcon, MenuIcon, MoonIcon, SECTION_ICONS, SunIcon, SystemThemeIcon } from './icons';

export interface AppShellSectionState {
  disabled?: boolean;
  reason?: string;
  badge?: string;
}

interface AppShellProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  navCollapsed: boolean;
  onToggleNavCollapsed: () => void;
  uiCompact: boolean;
  onToggleUiCompact: () => void;
  themePreference: ThemePreference;
  onCycleTheme: () => void;
  sectionState?: Partial<Record<AppSection, AppShellSectionState>>;
  identityBar?: ReactNode;
  topBar: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const TOPBAR_COLLAPSED_KEY = 'escala-dashboard:topbar-collapsed';

const THEME_ICON: Record<ThemePreference, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemThemeIcon,
};
const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'Tema: claro',
  dark: 'Tema: escuro',
  system: 'Tema: automático (segue o sistema)',
};

/**
 * Casca de navegação da FASE 14E: substitui a antiga página única por barra lateral
 * recolhível (desktop) / menu compacto (telas pequenas) + área de conteúdo com scroll
 * próprio. Não usa React Router de propósito — a seção ativa é só estado local
 * (ver src/lib/navigation.ts), preservando o rascunho/estado ao trocar de seção porque
 * nenhuma remontagem do App acontece, só a troca do que é renderizado dentro dela.
 */
export function AppShell({
  activeSection,
  onNavigate,
  navCollapsed,
  onToggleNavCollapsed,
  uiCompact,
  onToggleUiCompact,
  themePreference,
  onCycleTheme,
  sectionState,
  identityBar,
  topBar,
  footer,
  children,
}: AppShellProps) {
  const [topBarCollapsed, setTopBarCollapsed] = useState(() => localStorage.getItem(TOPBAR_COLLAPSED_KEY) === 'true');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const ThemeIcon = THEME_ICON[themePreference];

  const toggleTopBarCollapsed = () => {
    setTopBarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(TOPBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  return (
    <div className={`shell${navCollapsed ? ' nav-collapsed' : ''}${uiCompact ? ' ui-compact' : ''}`}>
      <button
        type="button"
        className="shell-mobile-nav-toggle"
        aria-expanded={mobileNavOpen}
        aria-controls="shell-nav"
        onClick={() => setMobileNavOpen((prev) => !prev)}
      >
        {mobileNavOpen ? <CloseIcon /> : <MenuIcon />}
        {mobileNavOpen ? 'Fechar menu' : 'Menu'}
      </button>

      <nav
        id="shell-nav"
        className={`shell-nav${mobileNavOpen ? ' open' : ''}`}
        role="tablist"
        aria-label="Navegação principal"
        aria-orientation="vertical"
      >
        <div className="shell-nav-head">
          <span className="shell-nav-brand">Painel de Escalas</span>
          <button
            type="button"
            className="shell-nav-collapse-btn"
            onClick={onToggleNavCollapsed}
            aria-label={navCollapsed ? 'Expandir navegação' : 'Recolher navegação'}
            title={navCollapsed ? 'Expandir navegação' : 'Recolher navegação'}
          >
            {navCollapsed ? <CollapseRightIcon /> : <CollapseLeftIcon />}
          </button>
        </div>
        <div className="shell-nav-items">
          {APP_SECTIONS.map((section) => {
            const state = sectionState?.[section.key];
            const Icon = SECTION_ICONS[section.key];
            return (
              <button
                key={section.key}
                type="button"
                role="tab"
                aria-selected={activeSection === section.key}
                aria-label={section.label}
                aria-describedby={`shell-nav-desc-${section.key}`}
                className="shell-nav-item"
                disabled={state?.disabled}
                title={state?.disabled ? state.reason : section.label}
                onClick={() => {
                  onNavigate(section.key);
                  setMobileNavOpen(false);
                }}
              >
                <Icon className="shell-nav-item-icon" />
                <span className="shell-nav-item-text">
                  <span className="shell-nav-item-label">{section.label}</span>
                  <span className="shell-nav-item-desc" id={`shell-nav-desc-${section.key}`}>
                    {section.description}
                  </span>
                </span>
                {state?.badge && <span className="shell-nav-item-badge" title={state.badge}>{state.badge}</span>}
              </button>
            );
          })}
        </div>
        <div className="shell-nav-footer">
          <button type="button" className="shell-theme-toggle" onClick={onCycleTheme} title={THEME_LABEL[themePreference]}>
            <ThemeIcon />
            <span>{THEME_LABEL[themePreference]}</span>
          </button>
          <label className="shell-ui-compact-toggle">
            <input type="checkbox" checked={uiCompact} onChange={onToggleUiCompact} />
            <span>Modo compacto</span>
          </label>
          {footer}
        </div>
      </nav>

      <div className="shell-main">
        {identityBar}
        <div className={`shell-topbar${topBarCollapsed ? ' collapsed' : ''}`}>
          {!topBarCollapsed && <div className="shell-topbar-content">{topBar}</div>}
          <button type="button" className="shell-topbar-collapse-btn" onClick={toggleTopBarCollapsed}>
            {topBarCollapsed ? 'Mostrar cabeçalho' : 'Recolher cabeçalho'}
          </button>
        </div>
        <div
          className="shell-content"
          ref={contentRef}
          onScroll={(event) => setShowBackToTop(event.currentTarget.scrollTop > 240)}
        >
          {children}
        </div>
        {showBackToTop && (
          <button
            type="button"
            className="shell-back-to-top"
            onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            ↑ Voltar ao topo
          </button>
        )}
      </div>
    </div>
  );
}
