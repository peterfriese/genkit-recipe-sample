'use server';

import {runFlow} from "@genkit-ai/flow";
import {personalChef} from "./genkit";

export interface Recipe {
  recipe: string,
  resultImage?: string
}

export async function callPersonalChefFlow(imageUrl: string, mealType: string, cuisine: string): Promise<Recipe> {
  const result = await runFlow(personalChef, {imageUrl, mealType, cuisine});
  console.log(result.recipe)
  return result;
}

// Note: We don't call startFlowsServer() here as it's a Next.js server component