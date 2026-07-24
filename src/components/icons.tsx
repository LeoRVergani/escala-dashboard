import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(children: React.ReactNode, props: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => base(
  <path d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />,
  props,
);

export const ImportIcon = (props: IconProps) => base(
  <>
    <path d="M12 3v12" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 19.5h16" />
  </>,
  props,
);

export const PlannerIcon = (props: IconProps) => base(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17" />
    <path d="M8 3v3M16 3v3" />
    <rect x="6.5" y="12" width="4" height="3.5" rx="0.6" />
  </>,
  props,
);

export const GridIcon = (props: IconProps) => base(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15M15 4.5v15" />
  </>,
  props,
);

export const DemoIcon = (props: IconProps) => base(
  <>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    <path d="M3 4l1.6 1.6M21 4l-1.6 1.6" />
  </>,
  props,
);

export const OfficialIcon = (props: IconProps) => base(
  <>
    <path d="M12 3 4 6.5v4c0 5 3.4 8.6 8 10.5 4.6-1.9 8-5.5 8-10.5v-4L12 3Z" />
    <path d="m9 12 2 2 4-4.5" />
  </>,
  props,
);

export const ShieldIcon = (props: IconProps) => base(
  <path d="M12 3 4 6.5v4c0 5 3.4 8.6 8 10.5 4.6-1.9 8-5.5 8-10.5v-4L12 3Z" />,
  props,
);

export const StatusIcon = (props: IconProps) => base(
  <>
    <path d="M3.5 19.5h17" />
    <rect x="5.5" y="12" width="3" height="6" rx="0.6" />
    <rect x="10.5" y="8" width="3" height="10" rx="0.6" />
    <rect x="15.5" y="4.5" width="3" height="13.5" rx="0.6" />
  </>,
  props,
);

export const AdminIcon = (props: IconProps) => base(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.8 19c0-3.1 2.3-5.5 5.2-5.5 1.2 0 2.3.4 3.2 1.1" />
    <path d="M17 13.5 20.5 15v2.1c0 2.2-1.4 3.8-3.5 4.7-2.1-.9-3.5-2.5-3.5-4.7V15L17 13.5Z" />
    <path d="m15.8 17.3.8.8 1.7-1.9" />
  </>,
  props,
);

export const SettingsIcon = (props: IconProps) => base(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M4.6 6.6l1.6 1.6M17.8 15.8l1.6 1.6M3 12h2.2M18.8 12H21M4.6 17.4l1.6-1.6M17.8 8.2l1.6-1.6" />
  </>,
  props,
);

export const SunIcon = (props: IconProps) => base(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
  </>,
  props,
);

export const MoonIcon = (props: IconProps) => base(
  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />,
  props,
);

export const SystemThemeIcon = (props: IconProps) => base(
  <>
    <rect x="3.5" y="4.5" width="17" height="12" rx="1.6" />
    <path d="M8 20h8M12 16.5V20" />
  </>,
  props,
);

export const UserIcon = (props: IconProps) => base(
  <>
    <circle cx="12" cy="8.2" r="3.4" />
    <path d="M5 20c0-3.6 3.1-6.4 7-6.4s7 2.8 7 6.4" />
  </>,
  props,
);

export const MenuIcon = (props: IconProps) => base(
  <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  props,
);

export const CloseIcon = (props: IconProps) => base(
  <path d="M5 5l14 14M19 5 5 19" />,
  props,
);

export const CollapseLeftIcon = (props: IconProps) => base(
  <path d="M15 5 8 12l7 7" />,
  props,
);

export const CollapseRightIcon = (props: IconProps) => base(
  <path d="M9 5l7 7-7 7" />,
  props,
);

export const SECTION_ICONS = {
  home: HomeIcon,
  schedules: GridIcon,
  import: ImportIcon,
  planner: PlannerIcon,
  grid: GridIcon,
  demo: DemoIcon,
  official: OfficialIcon,
  status: StatusIcon,
  admin: AdminIcon,
  settings: SettingsIcon,
} as const;
