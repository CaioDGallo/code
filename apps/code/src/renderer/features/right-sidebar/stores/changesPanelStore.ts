import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChangesViewMode = "list" | "tree";

interface ChangesPanelStoreState {
  preferredViewMode: ChangesViewMode;
  viewModeByTask: Record<string, ChangesViewMode>;
  rootExpandedByTask: Record<string, Partial<Record<ChangesViewMode, boolean>>>;
  expandedPathsByTask: Record<string, Set<string>>;
}

interface ChangesPanelStoreActions {
  setViewMode: (taskId: string, mode: ChangesViewMode) => void;
  setRootExpanded: (taskId: string, expanded: boolean) => void;
  toggleRoot: (taskId: string) => void;
  setPathExpanded: (taskId: string, path: string, expanded: boolean) => void;
  togglePath: (taskId: string, path: string) => void;
  setExpandedPaths: (taskId: string, paths: string[]) => void;
  expandPaths: (taskId: string, paths: string[]) => void;
  collapseAll: (taskId: string) => void;
  pruneExpandedPaths: (taskId: string, validPaths: string[]) => void;
}

type ChangesPanelStore = ChangesPanelStoreState & ChangesPanelStoreActions;

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export const useChangesPanelStore = create<ChangesPanelStore>()(
  persist(
    (set) => ({
      preferredViewMode: "list",
      viewModeByTask: {},
      rootExpandedByTask: {},
      expandedPathsByTask: {},
      setViewMode: (taskId, mode) =>
        set((state) => ({
          preferredViewMode: mode,
          viewModeByTask: {
            ...state.viewModeByTask,
            [taskId]: mode,
          },
        })),
      setRootExpanded: (taskId, expanded) =>
        set((state) => {
          const mode =
            state.viewModeByTask[taskId] ?? state.preferredViewMode ?? "list";

          return {
            rootExpandedByTask: {
              ...state.rootExpandedByTask,
              [taskId]: {
                ...(state.rootExpandedByTask[taskId] ?? {}),
                [mode]: expanded,
              },
            },
          };
        }),
      toggleRoot: (taskId) =>
        set((state) => {
          const mode =
            state.viewModeByTask[taskId] ?? state.preferredViewMode ?? "list";
          const current = state.rootExpandedByTask[taskId]?.[mode] ?? true;

          return {
            rootExpandedByTask: {
              ...state.rootExpandedByTask,
              [taskId]: {
                ...(state.rootExpandedByTask[taskId] ?? {}),
                [mode]: !current,
              },
            },
          };
        }),
      setPathExpanded: (taskId, path, expanded) =>
        set((state) => {
          const currentPaths =
            state.expandedPathsByTask[taskId] ?? new Set<string>();
          const nextPaths = new Set(currentPaths);

          if (expanded) {
            if (nextPaths.has(path)) return state;
            nextPaths.add(path);
          } else {
            if (!nextPaths.has(path)) return state;
            nextPaths.delete(path);
          }

          return {
            expandedPathsByTask: {
              ...state.expandedPathsByTask,
              [taskId]: nextPaths,
            },
          };
        }),
      togglePath: (taskId, path) =>
        set((state) => {
          const currentPaths =
            state.expandedPathsByTask[taskId] ?? new Set<string>();
          const nextPaths = new Set(currentPaths);

          if (nextPaths.has(path)) {
            nextPaths.delete(path);
          } else {
            nextPaths.add(path);
          }

          return {
            expandedPathsByTask: {
              ...state.expandedPathsByTask,
              [taskId]: nextPaths,
            },
          };
        }),
      setExpandedPaths: (taskId, paths) =>
        set((state) => {
          const currentPaths =
            state.expandedPathsByTask[taskId] ?? new Set<string>();
          const nextPaths = new Set(paths);

          if (areSetsEqual(currentPaths, nextPaths)) {
            return state;
          }

          return {
            expandedPathsByTask: {
              ...state.expandedPathsByTask,
              [taskId]: nextPaths,
            },
          };
        }),
      expandPaths: (taskId, paths) =>
        set((state) => {
          if (paths.length === 0) return state;

          const currentPaths =
            state.expandedPathsByTask[taskId] ?? new Set<string>();
          const nextPaths = new Set(currentPaths);
          let changed = false;

          for (const path of paths) {
            if (!nextPaths.has(path)) {
              nextPaths.add(path);
              changed = true;
            }
          }

          if (!changed) {
            return state;
          }

          return {
            expandedPathsByTask: {
              ...state.expandedPathsByTask,
              [taskId]: nextPaths,
            },
          };
        }),
      collapseAll: (taskId) =>
        set((state) => ({
          expandedPathsByTask: {
            ...state.expandedPathsByTask,
            [taskId]: new Set<string>(),
          },
        })),
      pruneExpandedPaths: (taskId, validPaths) =>
        set((state) => {
          const currentPaths = state.expandedPathsByTask[taskId];
          if (!currentPaths || currentPaths.size === 0) {
            return state;
          }

          const validPathSet = new Set(validPaths);
          const nextPaths = new Set<string>();
          let changed = false;

          for (const path of currentPaths) {
            if (validPathSet.has(path)) {
              nextPaths.add(path);
            } else {
              changed = true;
            }
          }

          if (!changed) {
            return state;
          }

          return {
            expandedPathsByTask: {
              ...state.expandedPathsByTask,
              [taskId]: nextPaths,
            },
          };
        }),
    }),
    {
      name: "changes-panel-storage",
      partialize: (state) => ({
        preferredViewMode: state.preferredViewMode,
        viewModeByTask: state.viewModeByTask,
      }),
    },
  ),
);

export const selectChangesViewMode =
  (taskId: string) => (state: ChangesPanelStore) =>
    state.viewModeByTask[taskId] ?? state.preferredViewMode ?? "list";

export const selectIsChangesRootExpanded =
  (taskId: string) => (state: ChangesPanelStore) => {
    const mode =
      state.viewModeByTask[taskId] ?? state.preferredViewMode ?? "list";
    return state.rootExpandedByTask[taskId]?.[mode] ?? true;
  };

const EMPTY_EXPANDED_PATHS = new Set<string>();

export const selectChangesExpandedPaths =
  (taskId: string) => (state: ChangesPanelStore) =>
    state.expandedPathsByTask[taskId] ?? EMPTY_EXPANDED_PATHS;
