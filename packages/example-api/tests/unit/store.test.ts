import { beforeEach, describe, expect, it } from "bun:test";
import { todoStore } from "../../src/store";

describe("TodoStore", () => {
  beforeEach(() => {
    todoStore.clear();
  });

  describe("create", () => {
    it("creates a todo with a unique ID", () => {
      const todo = todoStore.create("Buy milk");
      expect(todo.id).toBeDefined();
      expect(typeof todo.id).toBe("string");
      expect(todo.title).toBe("Buy milk");
      expect(todo.completed).toBe(false);
    });

    it("generates unique IDs for different todos", () => {
      const todo1 = todoStore.create("Todo 1");
      const todo2 = todoStore.create("Todo 2");
      expect(todo1.id).not.toBe(todo2.id);
    });
  });

  describe("list", () => {
    it("returns an empty array when no todos exist", () => {
      expect(todoStore.list()).toEqual([]);
    });

    it("returns all todos", () => {
      todoStore.create("Todo 1");
      todoStore.create("Todo 2");
      const todos = todoStore.list();
      expect(todos).toHaveLength(2);
      expect(todos[0].title).toBe("Todo 1");
      expect(todos[1].title).toBe("Todo 2");
    });
  });

  describe("get", () => {
    it("returns an existing todo by ID", () => {
      const created = todoStore.create("Test todo");
      const found = todoStore.get(created.id);
      expect(found).toEqual(created);
    });

    it("returns undefined for a missing ID", () => {
      const found = todoStore.get("non-existent-id");
      expect(found).toBeUndefined();
    });
  });

  describe("update", () => {
    it("updates the title of a todo", () => {
      const created = todoStore.create("Old title");
      const updated = todoStore.update(created.id, { title: "New title" });
      expect(updated).not.toBeNull();
      expect(updated?.title).toBe("New title");
      expect(updated?.completed).toBe(false);
    });

    it("updates the completed status of a todo", () => {
      const created = todoStore.create("Test");
      const updated = todoStore.update(created.id, { completed: true });
      expect(updated).not.toBeNull();
      expect(updated?.completed).toBe(true);
      expect(updated?.title).toBe("Test");
    });

    it("returns null for a missing ID", () => {
      const result = todoStore.update("non-existent-id", { title: "Nope" });
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes an existing todo and returns true", () => {
      const created = todoStore.create("To delete");
      const deleted = todoStore.delete(created.id);
      expect(deleted).toBe(true);
      expect(todoStore.get(created.id)).toBeUndefined();
    });

    it("returns false for a missing ID", () => {
      const deleted = todoStore.delete("non-existent-id");
      expect(deleted).toBe(false);
    });
  });

  describe("clear", () => {
    it("empties the store", () => {
      todoStore.create("Todo 1");
      todoStore.create("Todo 2");
      todoStore.clear();
      expect(todoStore.list()).toEqual([]);
    });
  });
});
