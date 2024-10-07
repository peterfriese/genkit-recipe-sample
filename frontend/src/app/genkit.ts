import * as z from 'zod';

// Import the Genkit core libraries and plugins.
import {generate} from '@genkit-ai/ai';
import {configureGenkit} from '@genkit-ai/core';
import {defineFlow, runFlow} from '@genkit-ai/flow';
import {vertexAI} from '@genkit-ai/vertexai';

// Import models from the Vertex AI plugin.
import {gemini15Flash} from '@genkit-ai/vertexai';
import {defineDotprompt, dotprompt, promptRef} from '@genkit-ai/dotprompt';

import {Storage} from '@google-cloud/storage';
import {imagen3} from '@genkit-ai/vertexai';

configureGenkit({
  plugins: [
    vertexAI({location: 'us-central1'}),
    dotprompt()
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});

const fridgeItemSchema = z.object({
  title: z.string().describe('The title of the item.'),
  quantity: z.number().describe('How many of this item can be seen')
}).describe('An item of food that can be seen in the fridge.');

const fridgeContentsSchema = z.array(fridgeItemSchema);

export const analyseFridgePrompt = defineDotprompt(
  {
    name: 'analyseFridgePrompt',
    model: gemini15Flash,
    input: {
      schema: z.object({
        imageUrl: z.string(),
      }),
    },
    // Specify the output schema using Zod
    output: {
      schema:
        z.array(
          z.object({
            title: z.string().describe('The title of the item.'),
            quantity: z.number().describe('How many of this item can be seen')
          }).describe('An item of food that can be seen in the fridge.')
        ).describe('The items of food that can be seen in the fridge.')
    },
    config: {
      temperature: 0.1,
    },
  },
  `
Tell me which items of food can be seen in this image.
Be as specific as you can, for example, tell me exactly
which kinds of vegetable you can see, what kinds of
beverages and other liquids, etc. Also, tell me how
many of each are there at least:

{{media url=imageUrl}} 
`
);

// Load the prompt from a .prompt file
const generateRecipePrompt = promptRef('generateRecipe');

// Alternatively, you can define the prompt inline
export const generateRecipePromptInCode = defineDotprompt(
  {
    name: 'generateRecipePromptInCode',
    model: gemini15Flash,
    input: {
      schema: z.object({
        contents: fridgeContentsSchema,
        mealType: z.string(),
        cuisine: z.string()
      })
    },
    output: {
      format: "text"
    },
    config: {
      temperature: 0.1
    }
  },
  `
  Generate a {{input.mealType}} recipe in the {{input.cuisine}} style that I can cook with these ingredients:
  {{#each contents}}
  - {{this.title}}
  {{/each}}
  `
);

export const analyseFridgeContents = defineFlow(
  {
    name: 'analyseFridgeContents',
    inputSchema: z.string().describe("Provide a URL to an image (http://, https://, or gs://)"),
    outputSchema: fridgeContentsSchema,
  },
  async (imageUrl) => {
    const imageBase64: string = await fetchImageAsBase64(imageUrl);

    const fridgeContents = await analyseFridgePrompt.generate<typeof fridgeContentsSchema>({
      input: {
        imageUrl: imageBase64
      }
    });

    return fridgeContents.output();
  }
);

const generateRecipeSchema = z.object({
  fridgeContents: fridgeContentsSchema,
  mealType: z.string(),
  cuisine: z.string()
});

export const generateRecipe = defineFlow(
  {
    name: "generateRecipe",
    inputSchema: generateRecipeSchema,
    outputSchema: z.string()
  },
  async (input) => {
    const recipe = await generateRecipePrompt.generate({
      input: {
        contents: input.fridgeContents,
        mealType: input.mealType,
        cuisine: input.cuisine
      }
    });
    return recipe.text();
  }
);

export const generateFinalResultImage = defineFlow(
  {
    name: "generateFinalResultImage",
    inputSchema: z.string(),
    outputSchema: z.string().optional()
  },
  async (input) => {
    const mediaResponse = await generate({
      prompt: `Photo of the final result of the following recipe: ${input}.`,
      model: imagen3,
      output: {format: 'media'}
    })
    return mediaResponse.media()?.url
  }
);

export const personalChef = defineFlow(
  {
    name: "personalChef",
    inputSchema: z.object({
      imageUrl: z.string(),
      mealType: z.string(),
      cuisine: z.string()
    }),
    outputSchema: z.object({
      recipe: z.string(),
      resultImage: z.string().optional()
    })
  },
  async (input) => {
    // 1: Analyse image - what's in the fridge?
    const fridgeContents = await runFlow(analyseFridgeContents, input.imageUrl);
    // 2: Generate recipe based on supplies
    const recipe = await runFlow(generateRecipe, {
      fridgeContents: fridgeContents,
      mealType: input.mealType,
      cuisine: input.cuisine
    });
    // 3: Generate an inspirational image
    const image = await runFlow(generateFinalResultImage, recipe);
    return {
      recipe,
      resultImage: image
    }
  }
);

async function fetchImageAsBase64(imageUrl: string) {
  let imageBase64: string;

  if (imageUrl.startsWith('gs://')) {
    // Handle Google Cloud Storage URL
    const storage = new Storage();
    const matches = imageUrl.match(/gs:\/\/([^\/]+)\/(.+)/);
    if (!matches) throw new Error('Invalid gs:// URL format');
    const [, bucketName, fileName] = matches;
    const [fileContents] = await storage.bucket(bucketName).file(fileName).download();
    const contentType = (await storage.bucket(bucketName).file(fileName).getMetadata())[0].contentType;
    imageBase64 = `data:${contentType};base64,${fileContents.toString('base64')}`;
  } else {
    // Handle HTTP/HTTPS URL
    const imageUrlData = await fetch(imageUrl);
    const buffer = await imageUrlData.arrayBuffer();
    const stringifiedBuffer = Buffer.from(buffer).toString('base64');
    const contentType = imageUrlData.headers.get('content-type');
    imageBase64 = `data:${contentType};base64,${stringifiedBuffer}`;
  }
  return imageBase64;
}
