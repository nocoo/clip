export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

class TodoStore {
  private todos: Map<string, Todo> = new Map();

  list(): Todo[] {
    return Array.from(this.todos.values());
  }

  get(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(title: string): Todo {
    const id = crypto.randomUUID();
    const todo: Todo = {
      id,
      title,
      completed: false,
    };
    this.todos.set(id, todo);
    return todo;
  }

  update(
    id: string,
    data: Partial<Pick<Todo, "title" | "completed">>,
  ): Todo | null {
    const todo = this.todos.get(id);
    if (!todo) return null;

    if (data.title !== undefined) todo.title = data.title;
    if (data.completed !== undefined) todo.completed = data.completed;

    this.todos.set(id, todo);
    return todo;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }

  clear(): void {
    this.todos.clear();
  }
}

export const todoStore = new TodoStore();
