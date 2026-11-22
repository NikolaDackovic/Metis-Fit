import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { secureStorage } from './storage';

/**
 * Favourite class types ("I always go to CrossFit and Boxing"): stored on this phone per account,
 * used to filter the schedule. Not sensitive, never sent anywhere.
 */
const key = (userId: string) => `grit.fav_class_types.${userId}`;

async function read(userId: string): Promise<string[]> {
  try {
    const raw = await secureStorage.getItem(key(userId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useFavoriteClassTypes(userId: string | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['favorites', 'class-types', userId],
    queryFn: () => read(userId!),
    enabled: Boolean(userId),
    staleTime: Infinity,
  });
  const toggle = useMutation({
    mutationFn: async (classTypeId: string) => {
      const now = await read(userId!);
      const next = now.includes(classTypeId)
        ? now.filter((x) => x !== classTypeId)
        : [...now, classTypeId].slice(-30);
      await secureStorage.setItem(key(userId!), JSON.stringify(next));
      return next;
    },
    onSuccess: (next) => qc.setQueryData(['favorites', 'class-types', userId], next),
  });
  const list = q.data ?? [];
  return {
    list,
    has: (id: string) => list.includes(id),
    toggle: (id: string) => userId && toggle.mutate(id),
  };
}
