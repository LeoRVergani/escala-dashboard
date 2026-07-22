import type { CSSProperties } from 'react';
import type { Technician } from '../types';

const AUTO_COLORS = ['#9a6700', '#b54708', '#15803d', '#1d4ed8', '#7e22ce', '#be185d', '#0f766e', '#a21caf'];

export function automaticTechnicianColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AUTO_COLORS[Math.abs(hash) % AUTO_COLORS.length];
}

function colorWithAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex;
}

export function technicianColor(name: string, technicians: Technician[]): string {
  return technicians.find((item) => item.name === name)?.color ?? automaticTechnicianColor(name);
}

function styleFromColor(color: string): CSSProperties {
  return {
    ['--tech-color' as string]: color,
    ['--tech-bg' as string]: colorWithAlpha(color, '12'),
    ['--tech-border' as string]: colorWithAlpha(color, '55'),
    ['--tech-strong-bg' as string]: colorWithAlpha(color, '20'),
  };
}

export function technicianStyle(name: string, technicians: Technician[]): CSSProperties {
  return styleFromColor(technicianColor(name, technicians));
}

export function technicianIdStyle(technicianId: string, technicians: Technician[]): CSSProperties {
  const technician = technicians.find((item) => item.id === technicianId);
  return styleFromColor(technician?.color ?? automaticTechnicianColor(technicianId));
}
