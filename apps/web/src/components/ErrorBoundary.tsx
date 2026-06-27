import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getDict } from '@/i18n/store';
import styles from './ErrorBoundary.module.css';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Dex UI error:', error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = getDict();
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>{t.errors.title}</div>
          <div className={styles.message}>{error.message}</div>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            {t.errors.reload}
          </button>
        </div>
      </div>
    );
  }
}
