import { useRoleFlag } from './roleFlag';

export const useMediaManager = (): { isMediaManager: boolean; loading: boolean } => {
  const { granted, loading } = useRoleFlag('mediaManagers');
  return { isMediaManager: granted, loading };
};
