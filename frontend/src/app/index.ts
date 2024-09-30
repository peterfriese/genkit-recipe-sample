'use server';

import { runFlow } from "@genkit-ai/flow";
import { personalChef } from "./genkit";

export async function callPersonalChefFlow(imageUrl: string, mealType: string, cuisine: string): Promise<string> {
    return await runFlow(personalChef, { imageUrl, mealType, cuisine });
  }
  
  // Note: We don't call startFlowsServer() here as it's a Next.js server component