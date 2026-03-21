import { Tooltip } from "@components/ui/Tooltip";
import type { ChangesViewMode } from "@features/right-sidebar/stores/changesPanelStore";
import {
  CaretRight,
  DotsThree,
  FolderIcon,
  FolderOpenIcon,
} from "@phosphor-icons/react";
import { Box, DropdownMenu, Flex, IconButton, Text } from "@radix-ui/themes";

interface ChangesRootRowProps {
  rootLabel: string;
  fileCount: number;
  isExpanded: boolean;
  viewMode: ChangesViewMode;
  isViewOptionsMenuOpen: boolean;
  hasFolderNodes: boolean;
  onToggleRoot: () => void;
  onViewOptionsMenuOpenChange: (open: boolean) => void;
  onSetViewMode: (mode: ChangesViewMode) => void;
  onExpandAllFolders: () => void;
  onCollapseAllFolders: () => void;
}

export function ChangesRootRow({
  rootLabel,
  fileCount,
  isExpanded,
  viewMode,
  isViewOptionsMenuOpen,
  hasFolderNodes,
  onToggleRoot,
  onViewOptionsMenuOpenChange,
  onSetViewMode,
  onExpandAllFolders,
  onCollapseAllFolders,
}: ChangesRootRowProps) {
  return (
    <Flex
      align="center"
      gap="1"
      className="h-6 overflow-hidden whitespace-nowrap border-transparent border-y pr-1.5 pl-2 hover:bg-gray-3"
    >
      <Tooltip content={rootLabel} side="top" delayDuration={500}>
        <Flex
          align="center"
          gap="1"
          onClick={onToggleRoot}
          className="h-full min-w-0 flex-1 cursor-pointer"
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
          <Text size="1" className="ml-0.5 min-w-0 flex-1 select-none truncate">
            {rootLabel}
          </Text>
          <Text size="1" color="gray" className="ml-0.5 shrink-0 select-none">
            {fileCount} file{fileCount === 1 ? "" : "s"}
          </Text>
        </Flex>
      </Tooltip>
      <DropdownMenu.Root
        open={isViewOptionsMenuOpen}
        onOpenChange={onViewOptionsMenuOpenChange}
      >
        <Tooltip content="Changes view options">
          <DropdownMenu.Trigger>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              className="ml-1 h-5 w-5 shrink-0 p-0"
            >
              <DotsThree size={14} weight="bold" />
            </IconButton>
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Content
          size="1"
          align="end"
          className="min-w-40"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DropdownMenu.Item
            onSelect={() =>
              onSetViewMode(viewMode === "list" ? "tree" : "list")
            }
          >
            <Text size="1">
              {viewMode === "list" ? "View as tree" : "View as list"}
            </Text>
          </DropdownMenu.Item>
          {viewMode === "tree" && (
            <>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onSelect={onExpandAllFolders}
                disabled={!hasFolderNodes}
              >
                <Text size="1">Expand all folders</Text>
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onCollapseAllFolders}>
                <Text size="1">Collapse all folders</Text>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Flex>
  );
}
