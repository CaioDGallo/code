import type { ChangedFile } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  buildChangesTreeModel,
  buildVisibleTreeRowIds,
  collapseDirectoryInVisibleRows,
  collectInitialExpandedPaths,
  expandDirectoryInVisibleRows,
  getParentDirectoryId,
  normalizePathForTree,
} from "./changesTreeModel";

function file(path: string): ChangedFile {
  return {
    path,
    status: "modified",
  };
}

describe("changesTreeModel", () => {
  it("builds tree and visible rows from expanded paths", () => {
    const model = buildChangesTreeModel([
      file("src/z.ts"),
      file("src/a.ts"),
      file("src/nested/b.ts"),
      { path: "README.md", status: "added" },
    ]);

    const collapsedRows = buildVisibleTreeRowIds(model, new Set());
    expect(collapsedRows).toEqual(["d:src", "f:README.md:added:"]);

    const expandedRows = buildVisibleTreeRowIds(
      model,
      new Set(["src", "src/nested"]),
    );
    expect(expandedRows).toEqual([
      "d:src",
      "d:src/nested",
      "f:src/nested/b.ts:modified:",
      "f:src/a.ts:modified:",
      "f:src/z.ts:modified:",
      "f:README.md:added:",
    ]);
  });

  it("localized expand and collapse match full recompute", () => {
    const model = buildChangesTreeModel([
      file("src/a.ts"),
      file("src/nested/b.ts"),
      file("src/nested/c.ts"),
    ]);

    const initialRows = buildVisibleTreeRowIds(model, new Set());
    expect(initialRows).toEqual(["d:src"]);

    const expandedSrcPaths = new Set(["src"]);
    const rowsAfterSrcExpand = expandDirectoryInVisibleRows(
      initialRows,
      model,
      "d:src",
      expandedSrcPaths,
    );
    expect(rowsAfterSrcExpand).toEqual(
      buildVisibleTreeRowIds(model, expandedSrcPaths),
    );

    const expandedNestedPaths = new Set(["src", "src/nested"]);
    const rowsAfterNestedExpand = expandDirectoryInVisibleRows(
      rowsAfterSrcExpand,
      model,
      "d:src/nested",
      expandedNestedPaths,
    );
    expect(rowsAfterNestedExpand).toEqual(
      buildVisibleTreeRowIds(model, expandedNestedPaths),
    );

    const rowsAfterCollapse = collapseDirectoryInVisibleRows(
      rowsAfterNestedExpand,
      model,
      "d:src",
    );
    expect(rowsAfterCollapse).toEqual(buildVisibleTreeRowIds(model, new Set()));
  });

  it("collects initial expanded paths for directory-only roots", () => {
    const model = buildChangesTreeModel([
      file("src/components/Button.tsx"),
      file("src/components/Icon.tsx"),
      file("docs/readme.md"),
    ]);

    const initialPaths = collectInitialExpandedPaths(model);
    expect(new Set(initialPaths)).toEqual(
      new Set(["src", "src/components", "docs"]),
    );
  });

  it("does not auto-expand when root has direct files", () => {
    const model = buildChangesTreeModel([file("README.md"), file("src/a.ts")]);
    expect(collectInitialExpandedPaths(model)).toEqual([]);
  });

  it("normalizes tree paths", () => {
    expect(normalizePathForTree("\\src\\components\\Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
    expect(normalizePathForTree("//src///components///")).toBe(
      "src/components",
    );
  });

  it("returns parent directory id for file and nested directory", () => {
    const model = buildChangesTreeModel([
      file("src/components/Button.tsx"),
      file("src/components/Icon.tsx"),
    ]);

    expect(
      getParentDirectoryId(model, "f:src/components/Button.tsx:modified:"),
    ).toBe("d:src/components");
    expect(getParentDirectoryId(model, "d:src/components")).toBe("d:src");
    expect(getParentDirectoryId(model, "d:src")).toBeNull();
  });
});
