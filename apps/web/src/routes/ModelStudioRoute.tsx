import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ModelStudio } from '@/components/model-studio/ModelStudio';

/**
 * Full-screen model studio at `/data/models/:projectId` (outside the Shell, like
 * `/threads/:id`). Entry routes carry the file to open: `?new=1` for a brand-new
 * model, `?open=<modelId>` to edit an existing one. Back returns to the Data
 * Models tab of the data browser.
 */
export function ModelStudioRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  if (!projectId) return null;
  return (
    <ModelStudio
      key={projectId}
      projectId={projectId}
      initialOpen={params.get('open') ?? undefined}
      initialNew={params.get('new') === '1'}
      onBack={() => navigate('/data', { state: { tab: 'datamodels' } })}
    />
  );
}
