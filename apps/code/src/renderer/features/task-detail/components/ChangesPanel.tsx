import { PanelMessage } from "@components/ui/PanelMessage";
import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
  useGitQueries,
} from "@features/git-interaction/hooks/useGitQueries";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import {
  isCloudDiffTabActiveInTree,
  isDiffTabActiveInTree,
} from "@features/panels/store/panelStoreHelpers";
import {
  type ChangesViewMode,
  selectChangesExpandedPaths,
  selectChangesViewMode,
  selectIsChangesRootExpanded,
  useChangesPanelStore,
} from "@features/right-sidebar/stores/changesPanelStore";
import { usePendingPermissionsForTask } from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { ChangesCloudFileRow } from "@features/task-detail/components/ChangesCloudFileRow";
import { ChangesFilesView } from "@features/task-detail/components/ChangesFilesView";
import { ChangesLocalFileRow } from "@features/task-detail/components/ChangesLocalFileRow";
import { useChangesKeyboardNavigation } from "@features/task-detail/hooks/useChangesKeyboardNavigation";
import { useCloudRunState } from "@features/task-detail/hooks/useCloudRunState";
import {
  buildChangesTreeModel,
  buildVisibleTreeRowIds,
  type ChangesTreeModel,
  collapseDirectoryInVisibleRows,
  collectDirectoryPaths,
  collectInitialExpandedPaths,
  expandDirectoryInVisibleRows,
  getChangedFileId,
} from "@features/task-detail/utils/changesTreeModel";
import { getCloudChangesState } from "@features/task-detail/utils/getCloudChangesState";
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";
import type { ChangedFile, Task } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ChangesPanelProps {
  taskId: string;
  task: Task;
}

function getBaseName(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  if (!normalized) return null;
  return normalized.split("/").pop() || null;
}

function getRepositoryName(
  repository: string | null | undefined,
): string | null {
  if (!repository) return null;
  return repository.split("/").pop() || null;
}

interface UseChangesTreeViewStateResult {
  treeModel: ChangesTreeModel;
  allDirectoryPaths: string[];
  visibleTreeRowIds: string[];
  expandedPaths: Set<string>;
  setDirectoryExpanded: (
    directoryPath: string,
    directoryId: string,
    expanded: boolean,
  ) => void;
  toggleDirectory: (directoryPath: string, directoryId: string) => void;
  expandAllDirectories: () => void;
  collapseAllDirectories: () => void;
}

function useChangesTreeViewState(
  taskId: string,
  files: ChangedFile[],
  viewMode: ChangesViewMode,
): UseChangesTreeViewStateResult {
  const expandedPaths = useChangesPanelStore(
    selectChangesExpandedPaths(taskId),
  );
  const expandPaths = useChangesPanelStore((state) => state.expandPaths);
  const setPathExpanded = useChangesPanelStore(
    (state) => state.setPathExpanded,
  );
  const setExpandedPaths = useChangesPanelStore(
    (state) => state.setExpandedPaths,
  );
  const collapseAll = useChangesPanelStore((state) => state.collapseAll);
  const pruneExpandedPaths = useChangesPanelStore(
    (state) => state.pruneExpandedPaths,
  );

  const treeModel = useMemo(() => buildChangesTreeModel(files), [files]);
  const allDirectoryPaths = useMemo(
    () => collectDirectoryPaths(treeModel),
    [treeModel],
  );

  const [visibleTreeRowIds, setVisibleTreeRowIds] = useState<string[]>(() =>
    buildVisibleTreeRowIds(treeModel, expandedPaths),
  );

  const skipExpandedSyncRef = useRef(false);
  const previousTreeModelRef = useRef(treeModel);
  const previousViewModeRef = useRef<ChangesViewMode | null>(null);

  useEffect(() => {
    pruneExpandedPaths(taskId, allDirectoryPaths);
  }, [allDirectoryPaths, pruneExpandedPaths, taskId]);

  useEffect(() => {
    const treeChanged = previousTreeModelRef.current !== treeModel;
    previousTreeModelRef.current = treeModel;

    if (treeChanged) {
      skipExpandedSyncRef.current = false;
      setVisibleTreeRowIds(buildVisibleTreeRowIds(treeModel, expandedPaths));
      return;
    }

    if (skipExpandedSyncRef.current) {
      skipExpandedSyncRef.current = false;
      return;
    }

    setVisibleTreeRowIds(buildVisibleTreeRowIds(treeModel, expandedPaths));
  }, [expandedPaths, treeModel]);

  useEffect(() => {
    const previousViewMode = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;

    const isInitialTreeLoad = previousViewMode === null && viewMode === "tree";
    const isEnteringTree =
      previousViewMode !== null &&
      previousViewMode !== "tree" &&
      viewMode === "tree";

    if (!isInitialTreeLoad && !isEnteringTree) {
      return;
    }

    const hasExpandedVisiblePath = allDirectoryPaths.some((path) =>
      expandedPaths.has(path),
    );
    if (hasExpandedVisiblePath) {
      return;
    }

    const initialExpandedPaths = collectInitialExpandedPaths(treeModel);
    if (initialExpandedPaths.length === 0) {
      return;
    }

    const nextExpandedPaths = new Set(expandedPaths);
    for (const path of initialExpandedPaths) {
      nextExpandedPaths.add(path);
    }

    skipExpandedSyncRef.current = true;
    expandPaths(taskId, initialExpandedPaths);
    setVisibleTreeRowIds(buildVisibleTreeRowIds(treeModel, nextExpandedPaths));
  }, [
    allDirectoryPaths,
    expandedPaths,
    expandPaths,
    taskId,
    treeModel,
    viewMode,
  ]);

  const setDirectoryExpanded = useCallback(
    (directoryPath: string, directoryId: string, expanded: boolean) => {
      const isExpanded = expandedPaths.has(directoryPath);
      if (isExpanded === expanded) {
        return;
      }

      skipExpandedSyncRef.current = true;
      setPathExpanded(taskId, directoryPath, expanded);

      if (expanded) {
        const nextExpandedPaths = new Set(expandedPaths);
        nextExpandedPaths.add(directoryPath);
        setVisibleTreeRowIds((currentRows) =>
          expandDirectoryInVisibleRows(
            currentRows,
            treeModel,
            directoryId,
            nextExpandedPaths,
          ),
        );
        return;
      }

      setVisibleTreeRowIds((currentRows) =>
        collapseDirectoryInVisibleRows(currentRows, treeModel, directoryId),
      );
    },
    [expandedPaths, setPathExpanded, taskId, treeModel],
  );

  const toggleDirectory = useCallback(
    (directoryPath: string, directoryId: string) => {
      setDirectoryExpanded(
        directoryPath,
        directoryId,
        !expandedPaths.has(directoryPath),
      );
    },
    [expandedPaths, setDirectoryExpanded],
  );

  const expandAllDirectories = useCallback(() => {
    if (allDirectoryPaths.length === 0) {
      return;
    }

    skipExpandedSyncRef.current = true;
    setExpandedPaths(taskId, allDirectoryPaths);
    setVisibleTreeRowIds(
      buildVisibleTreeRowIds(treeModel, new Set(allDirectoryPaths)),
    );
  }, [allDirectoryPaths, setExpandedPaths, taskId, treeModel]);

  const collapseAllDirectories = useCallback(() => {
    skipExpandedSyncRef.current = true;
    collapseAll(taskId);
    setVisibleTreeRowIds(buildVisibleTreeRowIds(treeModel, new Set<string>()));
  }, [collapseAll, taskId, treeModel]);

  return {
    treeModel,
    allDirectoryPaths,
    visibleTreeRowIds,
    expandedPaths,
    setDirectoryExpanded,
    toggleDirectory,
    expandAllDirectories,
    collapseAllDirectories,
  };
}

function CloudChangesPanel({ taskId, task }: ChangesPanelProps) {
  const { prUrl, effectiveBranch, repo, isRunActive, fallbackFiles } =
    useCloudRunState(taskId, task);

  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const viewMode = useChangesPanelStore(selectChangesViewMode(taskId));
  const isRootExpanded = useChangesPanelStore(
    selectIsChangesRootExpanded(taskId),
  );
  const setViewMode = useChangesPanelStore((state) => state.setViewMode);
  const toggleRoot = useChangesPanelStore((state) => state.toggleRoot);
  const setRootExpanded = useChangesPanelStore(
    (state) => state.setRootExpanded,
  );
  const [isViewOptionsMenuOpen, setIsViewOptionsMenuOpen] = useState(false);

  const isFileActive = (file: ChangedFile): boolean => {
    if (!layout) return false;
    return isCloudDiffTabActiveInTree(layout.panelTree, file.path, file.status);
  };

  const {
    data: prFiles,
    isPending: prPending,
    isError: prError,
  } = useCloudPrChangedFiles(prUrl);

  const {
    data: branchFiles,
    isPending: branchPending,
    isError: branchError,
  } = useCloudBranchChangedFiles(
    !prUrl ? repo : null,
    !prUrl ? effectiveBranch : null,
  );

  const changedFiles = prUrl ? (prFiles ?? []) : (branchFiles ?? []);
  const isLoading = prUrl ? prPending : effectiveBranch ? branchPending : false;
  const hasError = prUrl ? prError : effectiveBranch ? branchError : false;
  const effectiveFiles = changedFiles.length > 0 ? changedFiles : fallbackFiles;

  const {
    treeModel,
    allDirectoryPaths,
    visibleTreeRowIds,
    expandedPaths,
    toggleDirectory,
    expandAllDirectories,
    collapseAllDirectories,
  } = useChangesTreeViewState(taskId, effectiveFiles, viewMode);

  const handleExpandAllFolders = useCallback(() => {
    setRootExpanded(taskId, true);
    expandAllDirectories();
  }, [expandAllDirectories, setRootExpanded, taskId]);

  const cloudChangesState = getCloudChangesState({
    prUrl,
    effectiveBranch,
    isRunActive,
    effectiveFiles,
    isLoading,
    hasError,
  });

  if (cloudChangesState.kind === "waiting") {
    return (
      <PanelMessage detail={cloudChangesState.detail}>
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Waiting for changes...</Text>
        </Flex>
      </PanelMessage>
    );
  }

  if (cloudChangesState.kind === "loading") {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  if (cloudChangesState.kind === "pr_error") {
    return (
      <PanelMessage>
        <Flex direction="column" align="center" gap="2">
          <Text>Could not load file changes</Text>
          <Button size="1" variant="soft" asChild>
            <a
              href={cloudChangesState.prUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </Button>
        </Flex>
      </PanelMessage>
    );
  }

  if (cloudChangesState.kind === "empty") {
    return <PanelMessage>{cloudChangesState.message}</PanelMessage>;
  }

  const rootLabel =
    getRepositoryName(repo ?? task.repository) ?? "Cloud workspace";

  return (
    <ChangesFilesView
      rootLabel={rootLabel}
      files={effectiveFiles}
      viewMode={viewMode}
      isRootExpanded={isRootExpanded}
      isViewOptionsMenuOpen={isViewOptionsMenuOpen}
      selectedEntryId={null}
      treeModel={treeModel}
      visibleTreeRowIds={visibleTreeRowIds}
      expandedPaths={expandedPaths}
      allDirectoryPaths={allDirectoryPaths}
      onToggleRoot={() => toggleRoot(taskId)}
      onViewOptionsMenuOpenChange={setIsViewOptionsMenuOpen}
      onSetViewMode={(mode) => setViewMode(taskId, mode)}
      onToggleDirectory={toggleDirectory}
      onExpandAllFolders={handleExpandAllFolders}
      onCollapseAllFolders={collapseAllDirectories}
      renderFileRow={(file, options) => (
        <ChangesCloudFileRow
          file={file}
          taskId={taskId}
          isActive={isFileActive(file)}
          paddingLeft={options.paddingLeft}
          showTreeSpacer={options.showTreeSpacer}
        />
      )}
      footer={
        isRunActive ? (
          <Flex align="center" gap="2" px="3" py="2">
            <Spinner size="1" />
            <Text size="1" color="gray">
              Agent is still running...
            </Text>
          </Flex>
        ) : undefined
      }
    />
  );
}

export function ChangesPanel({ taskId, task }: ChangesPanelProps) {
  const workspace = useWorkspace(taskId);
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";

  if (isCloud) {
    return <CloudChangesPanel taskId={taskId} task={task} />;
  }

  return <LocalChangesPanel taskId={taskId} task={task} />;
}

function LocalChangesPanel({ taskId, task: _task }: ChangesPanelProps) {
  const workspace = useWorkspace(taskId);
  const repoPath = useCwd(taskId);
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const openDiffByMode = usePanelLayoutStore((state) => state.openDiffByMode);
  const viewMode = useChangesPanelStore(selectChangesViewMode(taskId));
  const isRootExpanded = useChangesPanelStore(
    selectIsChangesRootExpanded(taskId),
  );
  const setViewMode = useChangesPanelStore((state) => state.setViewMode);
  const toggleRoot = useChangesPanelStore((state) => state.toggleRoot);
  const setRootExpanded = useChangesPanelStore(
    (state) => state.setRootExpanded,
  );
  const [isViewOptionsMenuOpen, setIsViewOptionsMenuOpen] = useState(false);
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const hasPendingPermissions = pendingPermissions.size > 0;

  const { changedFiles, changesLoading: isLoading } = useGitQueries(repoPath);

  const {
    treeModel,
    allDirectoryPaths,
    visibleTreeRowIds,
    expandedPaths,
    setDirectoryExpanded,
    toggleDirectory,
    expandAllDirectories,
    collapseAllDirectories,
  } = useChangesTreeViewState(taskId, changedFiles, viewMode);

  const {
    selectedEntryId,
    selectedDirectoryPath,
    selectedFileId,
    hasKeyboardSelection,
  } = useChangesKeyboardNavigation({
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
  });

  const handleExpandAllFolders = useCallback(() => {
    setRootExpanded(taskId, true);
    expandAllDirectories();
  }, [expandAllDirectories, setRootExpanded, taskId]);

  const isFileActive = (file: ChangedFile): boolean => {
    if (!layout) return false;
    return isDiffTabActiveInTree(layout.panelTree, file.path, file.status);
  };

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  if (changedFiles.length === 0) {
    return (
      <Box height="100%" overflowY="auto" py="2">
        <Flex direction="column" height="100%">
          <PanelMessage>No file changes yet</PanelMessage>
        </Flex>
      </Box>
    );
  }

  const rootLabel =
    workspace?.worktreeName ??
    getBaseName(repoPath) ??
    getBaseName(workspace?.folderPath) ??
    "Workspace";

  return (
    <ChangesFilesView
      rootLabel={rootLabel}
      files={changedFiles}
      viewMode={viewMode}
      isRootExpanded={isRootExpanded}
      isViewOptionsMenuOpen={isViewOptionsMenuOpen}
      selectedEntryId={selectedEntryId}
      treeModel={treeModel}
      visibleTreeRowIds={visibleTreeRowIds}
      expandedPaths={expandedPaths}
      selectedDirectoryPath={selectedDirectoryPath}
      allDirectoryPaths={allDirectoryPaths}
      onToggleRoot={() => toggleRoot(taskId)}
      onViewOptionsMenuOpenChange={setIsViewOptionsMenuOpen}
      onSetViewMode={(mode) => setViewMode(taskId, mode)}
      onToggleDirectory={toggleDirectory}
      onExpandAllFolders={handleExpandAllFolders}
      onCollapseAllFolders={collapseAllDirectories}
      renderFileRow={(file, options) => (
        <ChangesLocalFileRow
          file={file}
          taskId={taskId}
          repoPath={repoPath}
          isActive={isFileActive(file)}
          isKeyboardSelected={
            hasKeyboardSelection
              ? selectedFileId === getChangedFileId(file)
              : undefined
          }
          mainRepoPath={workspace?.folderPath}
          paddingLeft={options.paddingLeft}
          showTreeSpacer={options.showTreeSpacer}
        />
      )}
      footer={
        isRootExpanded ? (
          <Flex align="center" justify="center" gap="2" py="2" wrap="wrap">
            <Flex align="center" gap="1">
              <CaretUpIcon size={12} color="var(--gray-10)" />
              <Text size="1" className="text-gray-10">
                /
              </Text>
              <CaretDownIcon size={12} color="var(--gray-10)" />
              {viewMode === "tree" && (
                <>
                  <Text size="1" className="text-gray-10">
                    /
                  </Text>
                  <CaretLeftIcon size={12} color="var(--gray-10)" />
                  <Text size="1" className="text-gray-10">
                    /
                  </Text>
                  <CaretRightIcon size={12} color="var(--gray-10)" />
                </>
              )}
              <Text size="1" className="text-gray-10" ml="1">
                to navigate
              </Text>
            </Flex>
          </Flex>
        ) : undefined
      }
    />
  );
}
