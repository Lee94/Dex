import { Outlet } from 'react-router';
import { Sidebar } from '@/components/Sidebar';
import styles from './ShellLayout.module.css';

/**
 * The sidebar + main-panel chrome shared by every non-thread surface (threads
 * list, projects, data browser, knowledge, tasks, placeholders). The matched
 * child route renders into `<Outlet />`. The full-screen thread view
 * (`/threads/:id`) deliberately sits outside this layout, so it has no sidebar.
 */
export function ShellLayout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}
