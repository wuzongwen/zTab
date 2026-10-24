import type { InputHTMLAttributes } from 'react';
import './switch.css';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'checked' | 'defaultChecked' | 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** Keep the native input for label activation, keyboard operation and forms. */
export function Switch({ checked, onCheckedChange, disabled, className = '', ...props }: SwitchProps) {
  return <span className={`ztab-switch ${className}`}>
    <input {...props} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => { if (!disabled) onCheckedChange(event.currentTarget.checked); }} />
    <span className="ztab-switch-track" aria-hidden="true" />
  </span>;
}
