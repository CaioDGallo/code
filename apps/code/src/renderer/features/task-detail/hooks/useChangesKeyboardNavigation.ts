import type { TaskLayout } from "@features/panels/store/panelLayoutStore";
import { isDiffTabActiveInTree } from "@features/panels/store/panelStoreHelpers";
import type { ChangesViewMode } from "@features/right-sidebar/stores/changesPanelStore";
import {
  type ChangesTreeModel,
  getChangedFileId,
  getNodeById,
  getParentDirectoryId,
} from "@features/task-detail/utils/changesTreeModel";
import type { ChangedFile } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

const KEY_REPEAT_PREVIEW_DEBOUNCE_MS = 100;

type ChangesNavigableEntry =
  | { type: "directory"; id: string; path: string }
  | { type: "file"; id: string; file: ChangedFile };

type ChangesFileNavigableEntry = Extract<
  ChangesNavigableEntry,
  { type: "file" }
>;

interface UseChangesKeyboardNavigationParams {
  taskId: string;
  viewMode: ChangesViewMode;
  isRootExpanded: boolean;
  isViewOptionsMenuOpen: boolean;
  hasPendingPermissions: boolean;
  changedFiles: ChangedFile[];
  visibleTreeRowIds: string[];
  treeModel: ChangesTreeModel;
  expandedPaths: Set<string>;
  layout: TaskLayout | null;
  openDiffByMode: (
    taskId: string,
    filePath: string,
    status?: string,
    asPreview?: boolean,
  ) => void;
  setDirectoryExpanded: (
    directoryPath: string,
    directoryId: string,
    expanded: boolean,
  ) => void;
}

interface UseChangesKeyboardNavigationResult {
  selectedEntryId: string | null;
  selectedDirectoryPath: string | null;
  selectedFileId: string | null;
  hasKeyboardSelection: boolean;
}

export function useChangesKeyboardNavigation({
  taskId,
  viewMode,
  isRootExpanded,
  isViewOptionsMenuOpen,
  hasPendingPermissions,
  changedFiles,
  visibleTreeRowIds,
  treeModel,
  expandedPaths,
  layout,
  openDiffByMode,
  setDirectoryExpanded,
}: UseChangesKeyboardNavigationParams): UseChangesKeyboardNavigationResult {
  const keyboardNavigableEntries = useMemo<ChangesNavigableEntry[]>(() => {
    if (!isRootExpanded) {
      return [];
    }

    if (viewMode === "list") {
      return changedFiles.map((file) => ({
        type: "file",
        id: getChangedFileId(file),
        file,
      }));
    }

    const entries: ChangesNavigableEntry[] = [];
    for (const rowId of visibleTreeRowIds) {
      const node = getNodeById(treeModel, rowId);
      if (!node) continue;

      if (node.kind === "directory") {
        entries.push({ type: "directory", id: node.id, path: node.path });
      } else {
        entries.push({ type: "file", id: node.id, file: node.file });
      }
    }

    return entries;
  }, [changedFiles, isRootExpanded, treeModel, viewMode, visibleTreeRowIds]);

  const entryIndexById = useMemo(() => {
    const entries = new Map<string, number>();
    for (let i = 0; i < keyboardNavigableEntries.length; i += 1) {
      entries.set(keyboardNavigableEntries[i].id, i);
    }
    return entries;
  }, [keyboardNavigableEntries]);

  const [keyboardSelectedEntryId, setKeyboardSelectedEntryId] = useState<
    string | null
  >(null);
  const selectedEntryIdRef = useRef<string | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef(layout);

  useEffect(() => {
    selectedEntryIdRef.current = keyboardSelectedEntryId;
  }, [keyboardSelectedEntryId]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const clearPendingPreview = useCallback(() => {
    if (!previewTimeoutRef.current) {
      return;
    }

    clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearPendingPreview();
    };
  }, [clearPendingPreview]);

  const isFileDiffActive = useCallback((file: ChangedFile): boolean => {
    const currentLayout = layoutRef.current;
    if (!currentLayout) return false;
    return isDiffTabActiveInTree(
      currentLayout.panelTree,
      file.path,
      file.status,
    );
  }, []);

  const previewFileEntry = useCallback(
    (entry: ChangesFileNavigableEntry, isRepeat: boolean) => {
      if (!isRepeat) {
        clearPendingPreview();
        if (!isFileDiffActive(entry.file)) {
          openDiffByMode(taskId, entry.file.path, entry.file.status);
        }
        return;
      }

      clearPendingPreview();

      const targetEntryId = entry.id;
      const targetFile = entry.file;
      previewTimeoutRef.current = setTimeout(() => {
        previewTimeoutRef.current = null;

        if (selectedEntryIdRef.current !== targetEntryId) {
          return;
        }

        if (!isFileDiffActive(targetFile)) {
          openDiffByMode(taskId, targetFile.path, targetFile.status);
        }
      }, KEY_REPEAT_PREVIEW_DEBOUNCE_MS);
    },
    [clearPendingPreview, isFileDiffActive, openDiffByMode, taskId],
  );

  const getActiveEntryId = useCallback((): string | null => {
    const currentLayout = layoutRef.current;
    if (!currentLayout) {
      return null;
    }

    const activeEntry = keyboardNavigableEntries.find(
      (entry) =>
        entry.type === "file" &&
        isDiffTabActiveInTree(
          currentLayout.panelTree,
          entry.file.path,
          entry.file.status,
        ),
    );

    return activeEntry?.id ?? null;
  }, [keyboardNavigableEntries]);

  useEffect(() => {
    if (keyboardNavigableEntries.length === 0) {
      setKeyboardSelectedEntryId(null);
      selectedEntryIdRef.current = null;
      clearPendingPreview();
      return;
    }

    setKeyboardSelectedEntryId((currentId) => {
      if (currentId && entryIndexById.has(currentId)) {
        return currentId;
      }

      return getActiveEntryId();
    });
  }, [
    clearPendingPreview,
    entryIndexById,
    getActiveEntryId,
    keyboardNavigableEntries.length,
  ]);

  const handleKeyNavigation = useCallback(
    (direction: "up" | "down", event?: KeyboardEvent) => {
      if (keyboardNavigableEntries.length === 0) return;

      const activeEntryId = getActiveEntryId();
      const selectedEntryId =
        keyboardSelectedEntryId && entryIndexById.has(keyboardSelectedEntryId)
          ? keyboardSelectedEntryId
          : activeEntryId;

      const startIndex = selectedEntryId
        ? (entryIndexById.get(selectedEntryId) ?? 0)
        : direction === "down"
          ? -1
          : keyboardNavigableEntries.length;

      const newIndex =
        direction === "up"
          ? Math.max(0, startIndex - 1)
          : Math.min(keyboardNavigableEntries.length - 1, startIndex + 1);

      const entry = keyboardNavigableEntries[newIndex];
      if (!entry) {
        return;
      }

      if (selectedEntryId === entry.id) {
        if (entry.type === "file" && !isFileDiffActive(entry.file)) {
          previewFileEntry(entry, Boolean(event?.repeat));
        }
        return;
      }

      setKeyboardSelectedEntryId(entry.id);
      selectedEntryIdRef.current = entry.id;

      if (entry.type === "file") {
        previewFileEntry(entry, Boolean(event?.repeat));
      } else {
        clearPendingPreview();
      }
    },
    [
      clearPendingPreview,
      entryIndexById,
      getActiveEntryId,
      isFileDiffActive,
      keyboardNavigableEntries,
      keyboardSelectedEntryId,
      previewFileEntry,
    ],
  );

  const handleHorizontalNavigation = useCallback(
    (direction: "left" | "right") => {
      if (viewMode !== "tree") return;
      if (keyboardNavigableEntries.length === 0) return;

      clearPendingPreview();

      const selectedEntryId =
        keyboardSelectedEntryId && entryIndexById.has(keyboardSelectedEntryId)
          ? keyboardSelectedEntryId
          : getActiveEntryId();
      if (!selectedEntryId) {
        return;
      }

      const selectedIndex = entryIndexById.get(selectedEntryId);
      if (selectedIndex === undefined) {
        return;
      }

      const entry = keyboardNavigableEntries[selectedIndex];
      if (!entry) {
        return;
      }

      if (entry.type === "file") {
        if (direction !== "left") {
          return;
        }

        const parentDirectoryId = getParentDirectoryId(treeModel, entry.id);
        if (parentDirectoryId) {
          setKeyboardSelectedEntryId(parentDirectoryId);
        }
        return;
      }

      const directoryNode = getNodeById(treeModel, entry.id);
      if (!directoryNode || directoryNode.kind !== "directory") {
        return;
      }

      setKeyboardSelectedEntryId(directoryNode.id);
      const isExpanded = expandedPaths.has(directoryNode.path);

      if (direction === "right") {
        if (!isExpanded) {
          setDirectoryExpanded(directoryNode.path, directoryNode.id, true);
          return;
        }

        const firstChildId = directoryNode.childIds[0];
        if (firstChildId) {
          setKeyboardSelectedEntryId(firstChildId);
        }
        return;
      }

      if (isExpanded) {
        setDirectoryExpanded(directoryNode.path, directoryNode.id, false);
        return;
      }

      const parentDirectoryId = getParentDirectoryId(
        treeModel,
        directoryNode.id,
      );
      if (parentDirectoryId) {
        setKeyboardSelectedEntryId(parentDirectoryId);
      }
    },
    [
      clearPendingPreview,
      entryIndexById,
      expandedPaths,
      getActiveEntryId,
      keyboardNavigableEntries,
      keyboardSelectedEntryId,
      setDirectoryExpanded,
      treeModel,
      viewMode,
    ],
  );

  const keyboardNavigationEnabled =
    !hasPendingPermissions &&
    keyboardNavigableEntries.length > 0 &&
    !isViewOptionsMenuOpen;

  useEffect(() => {
    if (!keyboardNavigationEnabled) {
      clearPendingPreview();
    }
  }, [clearPendingPreview, keyboardNavigationEnabled]);

  useHotkeys(
    "up",
    (event) => {
      event.preventDefault();
      handleKeyNavigation("up", event);
    },
    { enabled: keyboardNavigationEnabled },
    [handleKeyNavigation, keyboardNavigationEnabled],
  );
  useHotkeys(
    "down",
    (event) => {
      event.preventDefault();
      handleKeyNavigation("down", event);
    },
    { enabled: keyboardNavigationEnabled },
    [handleKeyNavigation, keyboardNavigationEnabled],
  );
  useHotkeys(
    "left",
    (event) => {
      event.preventDefault();
      handleHorizontalNavigation("left");
    },
    { enabled: keyboardNavigationEnabled && viewMode === "tree" },
    [handleHorizontalNavigation, keyboardNavigationEnabled, viewMode],
  );
  useHotkeys(
    "right",
    (event) => {
      event.preventDefault();
      handleHorizontalNavigation("right");
    },
    { enabled: keyboardNavigationEnabled && viewMode === "tree" },
    [handleHorizontalNavigation, keyboardNavigationEnabled, viewMode],
  );

  const selectedEntryIndex = keyboardSelectedEntryId
    ? entryIndexById.get(keyboardSelectedEntryId)
    : undefined;
  const selectedEntry =
    selectedEntryIndex !== undefined
      ? keyboardNavigableEntries[selectedEntryIndex]
      : null;

  return {
    selectedEntryId: selectedEntry?.id ?? null,
    selectedDirectoryPath:
      selectedEntry?.type === "directory" ? selectedEntry.path : null,
    selectedFileId: selectedEntry?.type === "file" ? selectedEntry.id : null,
    hasKeyboardSelection: selectedEntry !== null,
  };
}
