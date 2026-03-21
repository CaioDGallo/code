import type { ChangedFile } from "@shared/types";

interface BaseNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  parentId: string | null;
}

export interface ChangesDirectoryNode extends BaseNode {
  kind: "directory";
  childIds: string[];
}

export interface ChangesFileNode extends BaseNode {
  kind: "file";
  file: ChangedFile;
}

export type ChangesTreeNode = ChangesDirectoryNode | ChangesFileNode;

interface ChangesTreeDirectoryDraft {
  name: string;
  path: string;
  directories: Map<string, ChangesTreeDirectoryDraft>;
  files: ChangedFile[];
}

export interface ChangesTreeModel {
  rootChildrenIds: string[];
  nodesById: Map<string, ChangesTreeNode>;
  directoryPaths: string[];
}

function compareByName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function toPathSegments(path: string): string[] {
  const normalized = normalizePathForTree(path);
  if (!normalized) return [path];
  return normalized.split("/").filter((segment) => segment.length > 0);
}

function ensureUniqueId(
  id: string,
  nodesById: Map<string, ChangesTreeNode>,
): string {
  if (!nodesById.has(id)) {
    return id;
  }

  let suffix = 1;
  while (nodesById.has(`${id}#${suffix}`)) {
    suffix += 1;
  }
  return `${id}#${suffix}`;
}

function createDirectoryId(path: string): string {
  return `d:${path}`;
}

export function getChangedFileId(file: ChangedFile): string {
  return `f:${file.path}:${file.status}:${file.originalPath ?? ""}`;
}

export function normalizePathForTree(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

export function buildChangesTreeModel(files: ChangedFile[]): ChangesTreeModel {
  const root: ChangesTreeDirectoryDraft = {
    name: "",
    path: "",
    directories: new Map<string, ChangesTreeDirectoryDraft>(),
    files: [],
  };

  for (const file of files) {
    const segments = toPathSegments(file.path);
    const directorySegments = segments.slice(0, -1);

    let current = root;
    let currentPath = "";

    for (const segment of directorySegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = current.directories.get(segment);
      if (existing) {
        current = existing;
        continue;
      }

      const nextDirectory: ChangesTreeDirectoryDraft = {
        name: segment,
        path: currentPath,
        directories: new Map<string, ChangesTreeDirectoryDraft>(),
        files: [],
      };
      current.directories.set(segment, nextDirectory);
      current = nextDirectory;
    }

    current.files.push(file);
  }

  const nodesById = new Map<string, ChangesTreeNode>();
  const directoryPaths: string[] = [];

  const materializeDirectory = (
    directory: ChangesTreeDirectoryDraft,
    parentId: string | null,
    depth: number,
  ): string => {
    const baseDirectoryId = createDirectoryId(directory.path);
    const directoryId = ensureUniqueId(baseDirectoryId, nodesById);

    const directoryChildren = [...directory.directories.values()].sort((a, b) =>
      compareByName(a.name, b.name),
    );
    const fileChildren = [...directory.files].sort((a, b) =>
      compareByName(a.path, b.path),
    );

    const childIds: string[] = [];

    for (const childDirectory of directoryChildren) {
      childIds.push(
        materializeDirectory(childDirectory, directoryId, depth + 1),
      );
    }

    for (const file of fileChildren) {
      const baseFileId = getChangedFileId(file);
      const fileId = ensureUniqueId(baseFileId, nodesById);
      const fileName = file.path.split("/").pop() || file.path;

      nodesById.set(fileId, {
        kind: "file",
        id: fileId,
        name: fileName,
        path: file.path,
        depth: depth + 1,
        parentId: directoryId,
        file,
      });
      childIds.push(fileId);
    }

    nodesById.set(directoryId, {
      kind: "directory",
      id: directoryId,
      name: directory.name,
      path: directory.path,
      depth,
      parentId,
      childIds,
    });
    directoryPaths.push(directory.path);

    return directoryId;
  };

  const rootChildrenIds: string[] = [];
  const rootDirectories = [...root.directories.values()].sort((a, b) =>
    compareByName(a.name, b.name),
  );
  const rootFiles = [...root.files].sort((a, b) =>
    compareByName(a.path, b.path),
  );

  for (const rootDirectory of rootDirectories) {
    rootChildrenIds.push(materializeDirectory(rootDirectory, null, 0));
  }

  for (const file of rootFiles) {
    const baseFileId = getChangedFileId(file);
    const fileId = ensureUniqueId(baseFileId, nodesById);
    const fileName = file.path.split("/").pop() || file.path;

    nodesById.set(fileId, {
      kind: "file",
      id: fileId,
      name: fileName,
      path: file.path,
      depth: 0,
      parentId: null,
      file,
    });
    rootChildrenIds.push(fileId);
  }

  return {
    rootChildrenIds,
    nodesById,
    directoryPaths,
  };
}

export function getNodeById(
  model: ChangesTreeModel,
  nodeId: string,
): ChangesTreeNode | undefined {
  return model.nodesById.get(nodeId);
}

function collectVisibleDescendantRowIds(
  model: ChangesTreeModel,
  directoryId: string,
  expandedPaths: ReadonlySet<string>,
): string[] {
  const rootNode = model.nodesById.get(directoryId);
  if (!rootNode || rootNode.kind !== "directory") {
    return [];
  }

  const rowIds: string[] = [];
  const stack = [...rootNode.childIds].reverse();

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId) continue;

    rowIds.push(nodeId);

    const node = model.nodesById.get(nodeId);
    if (!node || node.kind !== "directory") continue;
    if (!expandedPaths.has(node.path)) continue;

    for (let i = node.childIds.length - 1; i >= 0; i -= 1) {
      stack.push(node.childIds[i]);
    }
  }

  return rowIds;
}

export function buildVisibleTreeRowIds(
  model: ChangesTreeModel,
  expandedPaths: ReadonlySet<string>,
): string[] {
  const rowIds: string[] = [];
  const stack = [...model.rootChildrenIds].reverse();

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId) continue;

    rowIds.push(nodeId);

    const node = model.nodesById.get(nodeId);
    if (!node || node.kind !== "directory") continue;
    if (!expandedPaths.has(node.path)) continue;

    for (let i = node.childIds.length - 1; i >= 0; i -= 1) {
      stack.push(node.childIds[i]);
    }
  }

  return rowIds;
}

function isDescendantNode(
  model: ChangesTreeModel,
  nodeId: string,
  possibleAncestorId: string,
): boolean {
  let current = model.nodesById.get(nodeId);
  while (current?.parentId) {
    if (current.parentId === possibleAncestorId) {
      return true;
    }
    current = model.nodesById.get(current.parentId);
  }
  return false;
}

export function expandDirectoryInVisibleRows(
  currentVisibleRows: readonly string[],
  model: ChangesTreeModel,
  directoryId: string,
  expandedPaths: ReadonlySet<string>,
): string[] {
  const directory = model.nodesById.get(directoryId);
  if (!directory || directory.kind !== "directory") {
    return [...currentVisibleRows];
  }

  if (directory.childIds.length === 0) {
    return [...currentVisibleRows];
  }

  const index = currentVisibleRows.indexOf(directoryId);
  if (index === -1) {
    return buildVisibleTreeRowIds(model, expandedPaths);
  }

  const firstNext = currentVisibleRows[index + 1];
  if (firstNext && isDescendantNode(model, firstNext, directoryId)) {
    return [...currentVisibleRows];
  }

  const descendants = collectVisibleDescendantRowIds(
    model,
    directoryId,
    expandedPaths,
  );
  if (descendants.length === 0) {
    return [...currentVisibleRows];
  }

  return [
    ...currentVisibleRows.slice(0, index + 1),
    ...descendants,
    ...currentVisibleRows.slice(index + 1),
  ];
}

export function collapseDirectoryInVisibleRows(
  currentVisibleRows: readonly string[],
  model: ChangesTreeModel,
  directoryId: string,
): string[] {
  const directory = model.nodesById.get(directoryId);
  if (!directory || directory.kind !== "directory") {
    return [...currentVisibleRows];
  }

  const index = currentVisibleRows.indexOf(directoryId);
  if (index === -1) {
    return [...currentVisibleRows];
  }

  let removeUntil = index + 1;
  while (removeUntil < currentVisibleRows.length) {
    const nextId = currentVisibleRows[removeUntil];
    if (!isDescendantNode(model, nextId, directoryId)) {
      break;
    }
    removeUntil += 1;
  }

  if (removeUntil === index + 1) {
    return [...currentVisibleRows];
  }

  return [
    ...currentVisibleRows.slice(0, index + 1),
    ...currentVisibleRows.slice(removeUntil),
  ];
}

export function collectDirectoryPaths(model: ChangesTreeModel): string[] {
  return model.directoryPaths;
}

export function collectInitialExpandedPaths(model: ChangesTreeModel): string[] {
  const hasRootFiles = model.rootChildrenIds.some((nodeId) => {
    const node = model.nodesById.get(nodeId);
    return node?.kind === "file";
  });

  if (hasRootFiles) {
    return [];
  }

  const expandedPaths = new Set<string>();

  const expandBranchUntilFile = (directoryId: string): void => {
    const directory = model.nodesById.get(directoryId);
    if (!directory || directory.kind !== "directory") {
      return;
    }

    expandedPaths.add(directory.path);

    const hasFileChild = directory.childIds.some((childId) => {
      const child = model.nodesById.get(childId);
      return child?.kind === "file";
    });
    if (hasFileChild) {
      return;
    }

    for (const childId of directory.childIds) {
      const child = model.nodesById.get(childId);
      if (child?.kind === "directory") {
        expandBranchUntilFile(child.id);
      }
    }
  };

  for (const nodeId of model.rootChildrenIds) {
    const node = model.nodesById.get(nodeId);
    if (node?.kind === "directory") {
      expandBranchUntilFile(node.id);
    }
  }

  return [...expandedPaths];
}

export function getParentDirectoryId(
  model: ChangesTreeModel,
  nodeId: string,
): string | null {
  const node = model.nodesById.get(nodeId);
  if (!node?.parentId) {
    return null;
  }

  const parent = model.nodesById.get(node.parentId);
  if (!parent || parent.kind !== "directory") {
    return null;
  }

  return parent.id;
}
