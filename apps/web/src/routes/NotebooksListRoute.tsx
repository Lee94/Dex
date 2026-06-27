import { useNavigate } from 'react-router';
import { NotebookList } from '@/components/notebook/NotebookList';
import { useNotebooksContext } from '@/contexts/NotebooksContext';

/**
 * The notebook list at `/notebooks`. Opening/creating a notebook routes to
 * `/notebooks/:id` (the editor route then hydrates it).
 */
export function NotebooksListRoute() {
  const nb = useNotebooksContext();
  const navigate = useNavigate();

  return (
    <NotebookList
      notebooks={nb.notebooks}
      loading={nb.listLoading}
      error={nb.listError}
      onOpen={(id) => navigate(`/notebooks/${id}`)}
      onCreate={async () => {
        const id = await nb.createNotebook();
        if (id) navigate(`/notebooks/${id}`);
      }}
      onRetry={nb.refreshList}
      onDelete={nb.deleteNotebook}
    />
  );
}
