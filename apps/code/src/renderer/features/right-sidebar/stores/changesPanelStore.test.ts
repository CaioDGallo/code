import { beforeEach, describe, expect, it } from "vitest";
import {
  selectChangesExpandedPaths,
  selectIsChangesRootExpanded,
  useChangesPanelStore,
} from "./changesPanelStore";

describe("changesPanelStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useChangesPanelStore.setState({
      preferredViewMode: "list",
      viewModeByTask: {},
      rootExpandedByTask: {},
      expandedPathsByTask: {},
    });
  });

  it("preserves root expanded state per mode on mode switch", () => {
    const taskId = "task-1";
    const store = useChangesPanelStore.getState();

    expect(selectIsChangesRootExpanded(taskId)(store)).toBe(true);

    store.setRootExpanded(taskId, false);
    expect(
      selectIsChangesRootExpanded(taskId)(useChangesPanelStore.getState()),
    ).toBe(false);

    store.setViewMode(taskId, "tree");
    expect(
      selectIsChangesRootExpanded(taskId)(useChangesPanelStore.getState()),
    ).toBe(true);

    store.setRootExpanded(taskId, false);
    expect(
      selectIsChangesRootExpanded(taskId)(useChangesPanelStore.getState()),
    ).toBe(false);

    store.setViewMode(taskId, "list");
    expect(
      selectIsChangesRootExpanded(taskId)(useChangesPanelStore.getState()),
    ).toBe(false);
  });

  it("prunes expanded paths that no longer exist", () => {
    const taskId = "task-2";
    const store = useChangesPanelStore.getState();

    store.setExpandedPaths(taskId, ["src", "src/components", "docs"]);
    store.pruneExpandedPaths(taskId, ["src", "src/components"]);

    const expandedPaths = selectChangesExpandedPaths(taskId)(
      useChangesPanelStore.getState(),
    );

    expect([...expandedPaths]).toEqual(["src", "src/components"]);
  });
});
