import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

type Variant = 'ghost' | 'quick' | 'green' | 'danger';

export function Button({
  variant = 'ghost',
  children,
  className,
  type = 'button',
  ...rest
}: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${styles[variant]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
