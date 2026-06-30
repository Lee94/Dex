import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ModelStudio } from '@/components/model-studio/ModelStudio';

const route = getRouteApi('/data/models/$projectId');

/**
 * Full-screen model studio at `/data/models/:projectId` (outside the Shell, like
 * `/threads/:id`). Entry routes carry the file to open: `?new=1` for a brand-new
 * model, `?open=<modelId>` to edit an existing one. Back returns to the Data
 * Models tab of the data browser.
 */
export function ModelStudioRoute() {
  const { projectId } = route.useParams();
  const { open, new: isNew } = route.useSearch();
  const navigate = useNavigate();
  return (
    <ModelStudio
      key={projectId}
      projectId={projectId}
      initialOpen={open}
      initialNew={isNew}
      onBack={() => navigate({ to: '/data/{-$connId}/{-$table}', search: { tab: 'datamodels' } })}
    />
  );
}
