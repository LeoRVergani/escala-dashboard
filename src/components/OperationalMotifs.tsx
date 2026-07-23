import { ALL_SCHEDULE_TOKENS } from '../lib/scheduleTokens';
import { ShieldIcon } from './icons';

type RailCode = 'Md' | 'M' | 'T' | 'N' | 'Folga';

interface ShiftRailProps {
  counts?: Partial<Record<RailCode, number>>;
}

interface DestinationSealProps {
  area: string;
  team: string;
  period?: string;
}

const RAIL_CODES: RailCode[] = ['Md', 'M', 'T', 'N', 'Folga'];
const TOKEN_COLOR_BY_CODE = new Map(ALL_SCHEDULE_TOKENS.map((token) => [token.code, token.colorHex]));

function colorForCode(code: RailCode): string {
  return TOKEN_COLOR_BY_CODE.get(code) ?? 'var(--line-strong)';
}

export function ShiftRail({ counts }: ShiftRailProps) {
  const rawValues = RAIL_CODES.map((code) => Math.max(0, counts?.[code] ?? 0));
  const total = rawValues.reduce((sum, value) => sum + value, 0);
  const placeholder = total === 0;
  const values = placeholder ? RAIL_CODES.map(() => 1) : rawValues;
  const denominator = placeholder ? RAIL_CODES.length : total;

  return (
    <div
      className="shift-rail"
      aria-hidden={placeholder ? 'true' : undefined}
      role={placeholder ? undefined : 'img'}
      aria-label={placeholder ? undefined : RAIL_CODES.map((code, index) => `${code}: ${rawValues[index]}`).join(', ')}
    >
      {RAIL_CODES.map((code, index) => (
        <span
          key={code}
          className="shift-rail__segment"
          title={placeholder ? code : `${code}: ${rawValues[index]}`}
          style={{
            flexBasis: `${(values[index] / denominator) * 100}%`,
            backgroundColor: placeholder ? 'var(--line-strong)' : colorForCode(code),
            opacity: placeholder ? 0.5 + index * 0.08 : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function DestinationSeal({ area, team, period }: DestinationSealProps) {
  return (
    <span className="destination-seal">
      <ShieldIcon />
      <span className="destination-seal__text">
        <span className="destination-seal__route">{area} / {team}</span>
        {period && <span className="destination-seal__period">{period}</span>}
      </span>
    </span>
  );
}
