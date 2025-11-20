
export interface UserSettings {
  name: string;
  weight: number; // kg
  activityLevel: 'sedentary' | 'active' | 'athlete';
  targetCalories: number;
  targetProtein: number; // grams
  targetCarbs: number; // grams
  inventory: {
    oven: boolean;
    blender: boolean;
    castIron: boolean;
    wok: boolean;
    kitchenAid: boolean;
    nonStickPan: boolean;
    airFryer: boolean;
  };
  excludedIngredients: string;
}

export interface MacroData {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface IngredientItem {
  amount: string; // e.g., "200g"
  item: string;   // e.g., "Tofu Block"
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface CookingStep {
  text: string;
  timer_seconds?: number; // Optional, extracted by AI
}

export interface RecipeVariation {
  ingredients: IngredientItem[];
  notes: string;
  steps: CookingStep[];
}

export interface RecipeAnalysis {
  title: string; // AI generated basic name
  original_macros: MacroData;
  variations: {
    Proteins: RecipeVariation;
    Balanced: RecipeVariation;
    Carbs: RecipeVariation;
  };
}

export interface SavedRecipe {
  id: string;
  title: string;
  timestamp: number;
  analysis: RecipeAnalysis; // We now store the FULL analysis (all 3 versions)
}

export interface DayPlan {
  date: string; // ISO Date string YYYY-MM-DD
  recipeId: string | null;
  variation?: 'Proteins' | 'Balanced' | 'Carbs'; // Track which version is used for this day
}

export enum AppState {
  HOME = 'HOME',
  COOKBOOK = 'COOKBOOK',
  CONFIG = 'CONFIG',
  INPUT = 'INPUT',
  ANALYZING = 'ANALYZING',
  RESULTS = 'RESULTS',
  SHOPPING_LIST = 'SHOPPING_LIST',
  ERROR = 'ERROR',
  RECIPE_SELECTOR = 'RECIPE_SELECTOR' // New state for picking recipes from planner
}
