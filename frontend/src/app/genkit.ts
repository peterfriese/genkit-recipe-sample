import * as z from 'zod';

// Import the Genkit core libraries and plugins.
import {generate} from '@genkit-ai/ai';
import {configureGenkit} from '@genkit-ai/core';
import {defineFlow, runFlow} from '@genkit-ai/flow';
import {vertexAI} from '@genkit-ai/vertexai';

// Import models from the Vertex AI plugin.
import {gemini15Flash} from '@genkit-ai/vertexai';
import {defineDotprompt} from '@genkit-ai/dotprompt';

import {Storage} from '@google-cloud/storage';

configureGenkit({
  plugins: [
    vertexAI({location: 'us-central1'}),
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});

const fridgeItemSchema = z.object({
  title: z.string().describe('The title of the item.'),
  quantity: z.number().describe('How many of this item can be seen')
});

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
    output: {
      schema: fridgeContentsSchema
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

export const generateRecipePrompt = defineDotprompt(
  {
    name: 'generateRecipePrompt',
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
    })
    return recipe.text();
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
    outputSchema: z.string()
  },
  async (input) => {
    const fridgeContents = await runFlow(analyseFridgeContents, input.imageUrl);
    const recipe = await runFlow(generateRecipe, {
      fridgeContents: fridgeContents,
      mealType: input.mealType,
      cuisine: input.cuisine
    });
    return recipe
  }
);