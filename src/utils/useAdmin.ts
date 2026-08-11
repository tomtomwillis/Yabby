import { useRoleFlag } from './roleFlag';

export const useAdmin = (): { isAdmin: boolean; loading: boolean } => {
  const { granted, loading } = useRoleFlag('admins');
  return { isAdmin: granted, loading };
};
