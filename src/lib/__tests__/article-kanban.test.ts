import { describe, expect, it } from "vitest";
import {
  getArticleKanbanCardOpenView,
  makeArticleKanbanColumnId,
  normalizeArticleKanbanState,
} from "@/lib/article-agent/kanban";

describe("article kanban state", () => {
  it("keeps custom columns, assignments, and explicit order while adding missing articles", () => {
    const state = normalizeArticleKanbanState(
      {
        columns: [
          { id: "todo", label: "Todo" },
          { id: "needs_image", label: "Needs image" },
          { id: "complete", label: "Complete" },
        ],
        assignments: {
          alpha: "needs_image",
          beta: "complete",
          unknown: "complete",
        },
        order: {
          needs_image: ["alpha", "unknown"],
          complete: ["beta"],
        },
      },
      ["alpha", "beta", "gamma"],
      { alpha: "todo", beta: "in_progress", gamma: "todo" }
    );

    expect(state.columns.map((column) => column.id)).toEqual(["todo", "in_progress", "complete", "needs_image"]);
    expect(state.assignments).toEqual({
      alpha: "needs_image",
      beta: "complete",
      gamma: "todo",
    });
    expect(state.order.needs_image).toEqual(["alpha"]);
    expect(state.order.complete).toEqual(["beta"]);
    expect(state.order.todo).toEqual(["gamma"]);
  });

  it("opens kanban article cards in the file-system editor view", () => {
    expect(getArticleKanbanCardOpenView()).toBe("files");
  });

  it("turns a new column label into a stable custom id without colliding", () => {
    expect(makeArticleKanbanColumnId("Needs Image", ["needs_image"])).toBe("needs_image_2");
    expect(makeArticleKanbanColumnId("   ", [])).toBe("column");
  });
});
