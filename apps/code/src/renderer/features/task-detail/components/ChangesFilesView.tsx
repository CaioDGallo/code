import type { ChangesViewMode } from "@features/right-sidebar/stores/changesPanelStore";
import { ChangesRootRow } from "@features/task-detail/components/ChangesRootRow";
import {
  getRowPaddingStyle,
  getTreePadding,
  ROOT_CHILD_PADDING,
} from "@features/task-detail/components/changesRowStyles";
import {
  type ChangesDirectoryNode,
  type ChangesTreeModel,
  getChangedFileId,
  getNodeById,
} from "@features/task-detail/utils/changesTreeModel";
import { CaretRight, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { ChangedFile } from "@shared/types";
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { VList, type VListHandle } from "virtua";

const KEYBOARD_SCROLL_PADDING_ROWS = 6;

interface ChangesDirectoryRowProps {
  node: ChangesDirectoryNode;
  isExpanded: boolean;
  selectedDirectoryPath: string | null;
  onToggle: () => void;
}

function ChangesDirectoryRow({
  node,
  isExpanded,
  selectedDirectoryPath,
  onToggle,
}: ChangesDirectoryRowProps) {
  const isSelected = selectedDirectoryPath === node.path;

  return (
    <Flex
      align="center"
      gap="1"
      onClick={onToggle}
      className={
        isSelected
          ? "h-5 cursor-pointer overflow-hidden whitespace-nowrap border-accent-8 border-y bg-accent-4 pr-2 pl-[var(--changes-row-padding)]"
          : "h-5 cursor-pointer overflow-hidden whitespace-nowrap border-transparent border-y pr-2 pl-[var(--changes-row-padding)] hover:bg-gray-3"
      }
      style={getRowPaddingStyle(getTreePadding(node.depth))}
    >
      <Box className="flex h-4 w-4 shrink-0 items-center justify-center">
        <CaretRight
          size={10}
          weight="bold"
          color="var(--gray-10)"
          className={`transition-transform duration-100 ease-in ${isExpanded ? "rotate-90" : "rotate-0"}`}
        />
      </Box>
      {isExpanded ? (
        <FolderOpenIcon size={14} weight="fill" color="var(--accent-9)" />
      ) : (
        <FolderIcon size={14} color="var(--accent-9)" />
      )}
      <Text size="1" className="ml-0.5 min-w-0 select-none truncate">
        {node.name}
      </Text>
    </Flex>
  );
}

export interface ChangesFilesViewProps {
  rootLabel: string;
  files: ChangedFile[];
  viewMode: ChangesViewMode;
  isRootExpanded: boolean;
  isViewOptionsMenuOpen: boolean;
  selectedEntryId?: string | null;
  treeModel: ChangesTreeModel;
  visibleTreeRowIds: string[];
  expandedPaths: Set<string>;
  selectedDirectoryPath?: string | null;
  allDirectoryPaths: string[];
  onToggleRoot: () => void;
  onViewOptionsMenuOpenChange: (open: boolean) => void;
  onSetViewMode: (mode: ChangesViewMode) => void;
  onToggleDirectory: (directoryPath: string, directoryId: string) => void;
  onExpandAllFolders: () => void;
  onCollapseAllFolders: () => void;
  renderFileRow: (
    file: ChangedFile,
    options: { paddingLeft: number; showTreeSpacer: boolean },
  ) => ReactNode;
  footer?: ReactNode;
}

export function ChangesFilesView({
  rootLabel,
  files,
  viewMode,
  isRootExpanded,
  isViewOptionsMenuOpen,
  selectedEntryId,
  treeModel,
  visibleTreeRowIds,
  expandedPaths,
  selectedDirectoryPath,
  allDirectoryPaths,
  onToggleRoot,
  onViewOptionsMenuOpenChange,
  onSetViewMode,
  onToggleDirectory,
  onExpandAllFolders,
  onCollapseAllFolders,
  renderFileRow,
  footer,
}: ChangesFilesViewProps) {
  const listRef = useRef<VListHandle>(null);

  const renderedRowIds = useMemo(
    () =>
      viewMode === "list"
        ? files.map((file) => getChangedFileId(file))
        : visibleTreeRowIds,
    [files, viewMode, visibleTreeRowIds],
  );

  useLayoutEffect(() => {
    if (!isRootExpanded || !selectedEntryId) {
      return;
    }

    const selectedIndex = renderedRowIds.indexOf(selectedEntryId);
    if (selectedIndex === -1) {
      return;
    }

    const handle = listRef.current;
    if (!handle) {
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      const itemSize = handle.getItemSize(selectedIndex);
      const viewportSize = handle.viewportSize;

      if (itemSize <= 0 || viewportSize <= 0) {
        handle.scrollToIndex(selectedIndex, { align: "nearest" });
        return;
      }

      const paddingPx = itemSize * KEYBOARD_SCROLL_PADDING_ROWS;
      const itemStart = handle.getItemOffset(selectedIndex);
      const itemEnd = itemStart + itemSize;
      const viewStart = handle.scrollOffset;
      const viewEnd = viewStart + viewportSize;
      const topThreshold = viewStart + paddingPx;
      const bottomThreshold = viewEnd - paddingPx;

      if (bottomThreshold <= topThreshold) {
        handle.scrollToIndex(selectedIndex, { align: "nearest" });
        return;
      }

      if (itemStart < topThreshold) {
        handle.scrollTo(Math.max(0, itemStart - paddingPx));
        return;
      }

      if (itemEnd > bottomThreshold) {
        const maxOffset = Math.max(0, handle.scrollSize - viewportSize);
        handle.scrollTo(
          Math.min(maxOffset, itemEnd + paddingPx - viewportSize),
        );
      }
    });

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [isRootExpanded, renderedRowIds, selectedEntryId]);

  return (
    <Box height="100%" py="2" className="flex min-h-0 flex-col">
      <ChangesRootRow
        rootLabel={rootLabel}
        fileCount={files.length}
        isExpanded={isRootExpanded}
        viewMode={viewMode}
        isViewOptionsMenuOpen={isViewOptionsMenuOpen}
        onToggleRoot={onToggleRoot}
        onViewOptionsMenuOpenChange={onViewOptionsMenuOpenChange}
        onSetViewMode={onSetViewMode}
        onExpandAllFolders={onExpandAllFolders}
        onCollapseAllFolders={onCollapseAllFolders}
        hasFolderNodes={allDirectoryPaths.length > 0}
      />

      {isRootExpanded && (
        <Box className="min-h-0 flex-1">
          <VList ref={listRef} shift={false} style={{ height: "100%" }}>
            {viewMode === "list"
              ? files.map((file) => (
                  <Box key={getChangedFileId(file)}>
                    {renderFileRow(file, {
                      paddingLeft: ROOT_CHILD_PADDING,
                      showTreeSpacer: false,
                    })}
                  </Box>
                ))
              : visibleTreeRowIds.map((rowId) => {
                  const node = getNodeById(treeModel, rowId);
                  if (!node) {
                    return null;
                  }

                  if (node.kind === "directory") {
                    return (
                      <ChangesDirectoryRow
                        key={node.id}
                        node={node}
                        isExpanded={expandedPaths.has(node.path)}
                        selectedDirectoryPath={selectedDirectoryPath ?? null}
                        onToggle={() => onToggleDirectory(node.path, node.id)}
                      />
                    );
                  }

                  return (
                    <Box key={node.id}>
                      {renderFileRow(node.file, {
                        paddingLeft: getTreePadding(node.depth),
                        showTreeSpacer: true,
                      })}
                    </Box>
                  );
                })}
            {footer && <div>{footer}</div>}
          </VList>
        </Box>
      )}
    </Box>
  );
}
