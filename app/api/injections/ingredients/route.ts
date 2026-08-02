/**
 * Ingredients Injection API
 * 
 * Bulk imports ingredients from public/ingredients.json
 * 
 * GET /api/injections/ingredients - Import all ingredients
 */

import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { IngredientModel } from "@/models/factories/Ingredients";
import ingredientsData from "@/public/ingredients.json";

interface IngredientPayload {
  name: string;
  stock: number;
  unit: string;
}

export async function GET() {
  try {
    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);
    
    const rawIngredients = ingredientsData as IngredientPayload[];
    const results = {
      total: rawIngredients.length,
      created: 0,
      updated: 0,
      errors: [] as string[],
      ingredients: [] as { name: string; id: string; stock: number; unit: string }[],
    };
    
    for (const raw of rawIngredients) {
      try {
        const ingredient = await Ingredient.findOneAndUpdate(
          { name: raw.name },
          {
            name: raw.name,
            stock: raw.stock,
            unit: raw.unit,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        // Check if newly created or updated
        const isNew = ingredient.createdAt?.getTime() === ingredient.updatedAt?.getTime();
        if (isNew) {
          results.created++;
        } else {
          results.updated++;
        }
        
        results.ingredients.push({
          name: ingredient.name,
          id: ingredient._id.toString(),
          stock: ingredient.stock,
          unit: ingredient.unit,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`Ingredient "${raw.name}": ${errorMsg}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Imported ${results.created} new, updated ${results.updated} ingredients`,
      ...results,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Ingredients Injection Error:", err);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
