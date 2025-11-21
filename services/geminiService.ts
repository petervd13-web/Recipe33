
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { UserSettings, RecipeAnalysis } from "../types";

const API_KEY = process.env.API_KEY || '';

// Schema definition for a single ingredient row
const ingredientSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    amount: { type: Type.STRING, description: "Measurement, e.g. '100g', '1 tbsp'" },
    item: { type: Type.STRING, description: "Ingredient name" },
    calories: { type: Type.INTEGER },
    protein: { type: Type.INTEGER },
    fat: { type: Type.INTEGER },
    carbs: { type: Type.INTEGER },
  },
  required: ["amount", "item", "calories", "protein", "fat", "carbs"],
};

// Reusable steps schema
const stepsSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      timer_seconds: { type: Type.INTEGER, nullable: true, description: "Time in seconds for this step. MUST be included if time is mentioned." },
    },
    required: ["text"],
  },
};

// Full Response Schema
const recipeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "A very short, basic name (e.g. 'Lentil Soup', 'Tofu Stir-fry', 'Oatmeal')" },
    original_macros: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.INTEGER },
        protein: { type: Type.INTEGER },
        fat: { type: Type.INTEGER },
        carbs: { type: Type.INTEGER },
      },
      required: ["calories", "protein", "fat", "carbs"],
    },
    variations: {
      type: Type.OBJECT,
      properties: {
        Proteins: {
          type: Type.OBJECT,
          properties: {
            ingredients: { type: Type.ARRAY, items: ingredientSchema },
            notes: { type: Type.STRING },
            steps: stepsSchema,
          },
          required: ["ingredients", "notes", "steps"],
        },
        Balanced: {
          type: Type.OBJECT,
          properties: {
            ingredients: { type: Type.ARRAY, items: ingredientSchema },
            notes: { type: Type.STRING },
            steps: stepsSchema,
          },
          required: ["ingredients", "notes", "steps"],
        },
        Carbs: {
          type: Type.OBJECT,
          properties: {
            ingredients: { type: Type.ARRAY, items: ingredientSchema },
            notes: { type: Type.STRING },
            steps: stepsSchema,
          },
          required: ["ingredients", "notes", "steps"],
        },
      },
      required: ["Proteins", "Balanced", "Carbs"],
    },
  },
  required: ["title", "original_macros", "variations"],
};

const getSystemPrompt = (userSettings: UserSettings) => {
  const equipmentList = Object.entries(userSettings.inventory)
    .filter(([_, hasIt]) => hasIt)
    .map(([name]) => name.replace(/([A-Z])/g, ' $1').toLowerCase())
    .join(", ");

  return `
    You are an elite Vegetarian Sports Nutritionist and Chef running on Gemini 2.5 Pro.
    
    CONTEXT:
    - User: ${userSettings.weight}kg. 
    - Goal: Body Recomposition (Build Muscle / Lose Fat).
    - Targets (PER PERSON): ~${userSettings.targetCalories} kcal, >${userSettings.targetProtein}g Protein, >${userSettings.targetCarbs}g Carbs.
    - Equipment: ${equipmentList || 'basic stovetop and pots only'}.
    - EXCLUDED: ${userSettings.excludedIngredients || 'Meat, Chicken, Fish'}.
    - DIETARY PREFERENCE: Vegetarian/Plant-Based. Strictly NO meat, NO chicken, NO fish.

    TASK:
    1. Analyze recipe inputs (images or text).
    2. TITLE: Generate a VERY SHORT, BASIC title.
    3. GENERATE 3 STRICT VARIATIONS:
      - "Proteins": MAXIMIZE PROTEIN (e.g. add seitan, tempeh, egg whites, protein powder).
      - "Carbs": MAXIMIZE CARBS. Ideal for pre-workout.
      - "Balanced": The "Best of Both Worlds".
    
    CRITICAL RULES FOR INGREDIENTS & MACROS:
    - **PORTIONS**: All ingredient lists must be strictly for **2 PEOPLE (2 SERVINGS)**.
    - **MACROS**: The calories, protein, fat, and carbs fields for each ingredient must be calculated **PER PERSON** (for 1 serving).
      (Example: If recipe needs 400g Tofu for 2 people, the line item is "400g Tofu", but the macros are for 200g).
    
    4. BREAKDOWN:
      - Provide a TABLE of ingredients.
      - Ensure the sum of the ingredient macros (per person) matches the variation totals.
    
    5. INSTRUCTIONS:
      - Rewrite steps for clarity.
      - ALWAYS extract duration in seconds for ANY step involving time.
  `;
};

export const analyzeRecipeWithGemini = async (
  userSettings: UserSettings,
  imagesBase64: string[],
  textInput: string
): Promise<RecipeAnalysis> => {
  
  if (!API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const systemPrompt = getSystemPrompt(userSettings);

  const parts: any[] = [];
  
  // Support multiple images
  if (imagesBase64 && imagesBase64.length > 0) {
    imagesBase64.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: img,
        },
      });
    });
  }
  
  if (textInput) {
    parts.push({ text: textInput });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", 
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
        temperature: 0.2,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini.");
    
    return JSON.parse(text) as RecipeAnalysis;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to analyze recipe.");
  }
};

export const refineRecipeWithGemini = async (
  userSettings: UserSettings,
  currentAnalysis: RecipeAnalysis,
  instruction: string
): Promise<RecipeAnalysis> => {

  if (!API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const systemPrompt = getSystemPrompt(userSettings);

  const refinementPrompt = `
    The user wants to REFINE the existing recipe based on a specific instruction.
    
    EXISTING RECIPE JSON:
    ${JSON.stringify(currentAnalysis)}

    USER INSTRUCTION:
    "${instruction}"

    TASK:
    1. Modify the existing recipe JSON to strictly follow the user instruction.
    2. REMEMBER: Ingredients for **2 SERVINGS**, Macros **PER PERSON**.
    3. If ingredients change, RECALCULATE the macros.
    4. Return the FULLY updated JSON structure in the exact same schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", 
      contents: {
        parts: [{ text: refinementPrompt }]
      },
      config: {
        systemInstruction: systemPrompt, // Maintain persona
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
        temperature: 0.2,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini.");
    
    return JSON.parse(text) as RecipeAnalysis;

  } catch (error: any) {
    console.error("Gemini Refine Error:", error);
    throw new Error(error.message || "Failed to refine recipe.");
  }
};
