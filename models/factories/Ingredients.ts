import { Model, Connection } from 'mongoose';
import { IIngredient, IngredientSchema } from '../schemas/ingredient.schema';

export function IngredientModel(conn: Connection): Model<IIngredient> {
  return (
    conn.models.Ingredient ||
    conn.model<IIngredient>('Ingredient', IngredientSchema)
  );
}