import { useId } from 'react';
import { Palette } from 'lucide-react';

export function isHexColor(value: string): boolean {
  return value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}

/** Controlled throughout: native changes never bypass the owner's save/rollback path. */
export function ColorPicker({ value, label, onValueChange, disabled = false, presets = [] }: {
  value: string; label: string; onValueChange: (value: string) => void;
  disabled?: boolean; presets?: readonly string[];
}) {
  const id = useId();
  const choose = (next: string) => {
    if (!disabled && isHexColor(next) && next.toLowerCase() !== value.toLowerCase()) onValueChange(next);
  };
  return <div className="color-picker" role="group" aria-label={label}>
    <label className="color-picker-control" data-disabled={disabled}>
      <span className="color-picker-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
      <span className="color-picker-copy"><strong>{value}</strong><small id={id}>点击调色</small></span>
      <Palette size={16} aria-hidden="true" />
      <input type="color" aria-label={label} aria-describedby={id} value={value} disabled={disabled}
        onChange={event => choose(event.currentTarget.value)} />
    </label>
    {presets.length > 0 && <div className="color-picker-presets" aria-label={`${label}预设`}>
      {presets.map(color => <button key={color} type="button" disabled={disabled}
        aria-label={`${label}${color}`} aria-pressed={value.toLowerCase() === color.toLowerCase()}
        title={color} onClick={() => choose(color)}><span style={{ backgroundColor: color }} aria-hidden="true" /></button>)}
    </div>}
  </div>;
}
