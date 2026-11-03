export class DishNotFoundError extends Error {
  constructor() {
    super("Dish does not exist.");
    this.name = "DishNotFoundError";
  }
}
