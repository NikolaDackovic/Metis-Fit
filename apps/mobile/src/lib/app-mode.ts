import { useEffect } from 'react';
import { create } from 'zustand';
import { useMe } from './queries';
import { secureStorage } from './storage';
import { useTrainerState } from './trainer';

/**
 * A trainer uses the app two ways: at work (schedule, clients, messages) or training like any
 * member. The choice is kept per account on this device and switched with one tap.
 */
export type AppMode = 'coach' | 'member';

const key = (userId: string) => `metis.mode.${userId}`;

const useStore = create<{ userId: string | null; mode: AppMode | null; loaded: boolean }>(() => ({
  userId: null,
  mode: null,
  loaded: false,
}));

export async function setAppMode(userId: string, mode: AppMode) {
  useStore.setState({ userId, mode, loaded: true });
  await secureStorage.setItem(key(userId), mode);
}

/**
 * The mode in use. Members who are not trainers are always 'member'. `chosen` is false until a
 * trainer has picked once (then the app asks).
 */
export function useAppMode(): {
  mode: AppMode;
  chosen: boolean;
  loaded: boolean;
  isTrainer: boolean;
  /** Everything needed to pick the right tabs is known. */
  ready: boolean;
} {
  const userId = useMe().data?.id ?? null;
  const { isTrainer, ready: trainerKnown } = useTrainerState();
  const s = useStore();
  useEffect(() => {
    if (!userId || (s.loaded && s.userId === userId)) return;
    void secureStorage.getItem(key(userId)).then((v) =>
      useStore.setState({
        userId,
        mode: v === 'coach' || v === 'member' ? v : null,
        loaded: true,
      }),
    );
  }, [userId, s.loaded, s.userId]);
  const loaded = s.loaded && s.userId === userId;
  return {
    mode: isTrainer && loaded && s.mode === 'coach' ? 'coach' : 'member',
    chosen: loaded && s.mode !== null,
    loaded,
    isTrainer,
    ready: trainerKnown && (!isTrainer || loaded),
  };
}
