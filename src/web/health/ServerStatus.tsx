import { useQuery } from '@tanstack/react-query';

import { healthOkSchema } from '../../shared/health';
import { apiFetch } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';

// A small line in the footer: "Server: connected", or the error with a retry
// button. It is the first thing on screen that calls the API, through the
// proxy, apiFetch and TanStack Query, so the loading and error paths are used
// for real before any feature page exists. Feature pages can replace it later
// or leave it in place; nothing else depends on it.
export function ServerStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) =>
      healthOkSchema.parse(await apiFetch('/healthz', { signal })),
  });

  if (health.isPending) return <Loading label="Checking the server…" />;
  if (health.isError) {
    return (
      <ErrorMessage
        error={health.error}
        onRetry={() => void health.refetch()}
      />
    );
  }
  return <p className="server-status">Server: connected</p>;
}
