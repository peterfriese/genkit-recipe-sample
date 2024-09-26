import * as z from 'zod';

// Import the Genkit core libraries and plugins.
import {generate} from '@genkit-ai/ai';
import {configureGenkit} from '@genkit-ai/core';
import {defineFlow, runFlow, startFlowsServer} from '@genkit-ai/flow';
import {vertexAI} from '@genkit-ai/vertexai';

// Import models from the Vertex AI plugin. The Vertex AI API provides access to
// several generative models. Here, we import Gemini 1.5 Flash.
import {gemini15Flash} from '@genkit-ai/vertexai';
import {defineDotprompt} from '@genkit-ai/dotprompt';

configureGenkit({
  plugins: [
    // Load the Vertex AI plugin. You can optionally specify your project ID
    // by passing in a config object; if you don't, the Vertex AI plugin uses
    // the value from the GCLOUD_PROJECT environment variable.
    vertexAI({location: 'us-central1'}),
  ],
  // Log debug output to tbe console.
  logLevel: 'debug',
  // Perform OpenTelemetry instrumentation and enable trace collection.
  enableTracingAndMetrics: true,
});

const fridgeItemSchema = z.object({
  title: z.string().describe('The title of the item.'),
  // description: z.string().describe('A short description of the item, such as its color.'),
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
        contents: fridgeContentsSchema
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
  Generate a recipe that I can cook with these ingredients:
{{#each contents}}
- {{this.title}}
{{/each}}
  `
);

export const analyseFridgeContents = defineFlow(
  {
    name: 'analyseFridgeContents',
    inputSchema: z.string().describe("Provide a URL to an image"),
    outputSchema: fridgeContentsSchema,
  },
  async (imageUrl) => {
    const imageUrlData = await fetch(imageUrl);
    const buffer = await imageUrlData.arrayBuffer();
    const stringifiedBuffer = Buffer.from(buffer).toString('base64');
    const contentType = imageUrlData.headers.get('content-type');
    const imageBase64 =
      `data:${contentType};base64,${stringifiedBuffer}`;

    const fridgeContents = await analyseFridgePrompt.generate<typeof fridgeContentsSchema>({
      input: {
        imageUrl: imageBase64
      }
    });

    // await generate({
    //   prompt: `Tell me which items of food can be seen in this image. 
    //            Be as specific as you can, for example, tell me exactly 
    //            which kinds of vegetable you can see, what kinds of 
    //            beverages and other liquids, etc. Also, tell me how 
    //            many of each are there at least:
    //            {media url=${imageBase64}}`,
    //   model: gemini15Flash,
    //   config: {
    //     temperature: 0
    //   },
    // });

    return fridgeContents.output();
  }
);

export const generateRecipe = defineFlow(
  {
    name: "generateRecipe",
    inputSchema: fridgeContentsSchema,
    outputSchema: z.string()
  },
  async (fridgeContents) => {
    const recipe = await generateRecipePrompt.generate({
      input: {
        contents: fridgeContents
      }
    })
    return recipe.text();
  }
);

export const personalChef = defineFlow(
  {
    name: "personalChef",
    inputSchema: z.string(),
    outputSchema: z.string()
  },
  async (input) => {
    const fridgeContents = await runFlow(analyseFridgeContents, input);
    const recipe = await runFlow(generateRecipe, fridgeContents)
    return recipe
  }
)



// Start a flow server, which exposes your flows as HTTP endpoints. This call
// must come last, after all of your plug-in configuration and flow definitions.
// You can optionally specify a subset of flows to serve, and configure some
// HTTP server options, but by default, the flow server serves all defined flows.
startFlowsServer();
