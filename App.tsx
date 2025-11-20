
import React, { useState, useRef, useEffect } from 'react';
import { UserSettings, RecipeAnalysis, AppState, SavedRecipe, DayPlan, IngredientItem, MacroData } from './types';
import { analyzeRecipeWithGemini, refineRecipeWithGemini } from './services/geminiService';
import MacroChart from './components/MacroChart';
import StepTimer from './components/StepTimer';

// Initial Settings
const DEFAULT_SETTINGS: UserSettings = {
  name: 'Athlete',
  weight: 72,
  activityLevel: 'active',
  targetCalories: 700,
  targetProtein: 40,
  targetCarbs: 50,
  inventory: {
    oven: false,
    blender: false,
    castIron: false,
    wok: false,
    kitchenAid: false,
    nonStickPan: false,
    airFryer: false,
  },
  excludedIngredients: ''
};

// Date Helpers
const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const newDate = new Date(date.setDate(diff));
  newDate.setHours(0,0,0,0);
  return newDate;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDate = (date: Date) => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getWeekNumber = (d: Date) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  
  // Analysis State
  const [analysis, setAnalysis] = useState<RecipeAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'Proteins' | 'Balanced' | 'Carbs'>('Balanced');
  
  // Editable Recipe State
  const [currentIngredients, setCurrentIngredients] = useState<IngredientItem[]>([]);
  const [currentTitle, setCurrentTitle] = useState<string>("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [textInput, setTextInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence State
  const [cookbook, setCookbook] = useState<SavedRecipe[]>([]);
  // weekPlan is now a list of DayPlans. We filter/find by date string.
  const [weekPlan, setWeekPlan] = useState<DayPlan[]>([]);
  
  // Planner Navigation
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));

  // Shopping List State
  const [shoppingView, setShoppingView] = useState<'RECIPE' | 'ALPHA'>('RECIPE');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Navigation State
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectingForDate, setSelectingForDate] = useState<string | null>(null);

  // --- Effects ---

  // Load from local storage on mount
  useEffect(() => {
    const savedCookbook = localStorage.getItem('cookbook');
    const savedPlan = localStorage.getItem('weekPlan');
    const savedSettings = localStorage.getItem('userSettings');
    const savedChecks = localStorage.getItem('checkedItems');

    if (savedCookbook) {
        try {
             const parsed = JSON.parse(savedCookbook);
             if (parsed.length > 0 && !parsed[0].analysis) {
                 setCookbook([]); 
             } else {
                 setCookbook(parsed);
             }
        } catch (e) {
            console.error("Failed to load cookbook", e);
        }
    }
    if (savedPlan) setWeekPlan(JSON.parse(savedPlan));
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedChecks) setCheckedItems(new Set(JSON.parse(savedChecks)));
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('cookbook', JSON.stringify(cookbook));
    localStorage.setItem('weekPlan', JSON.stringify(weekPlan));
    localStorage.setItem('userSettings', JSON.stringify(settings));
    localStorage.setItem('checkedItems', JSON.stringify(Array.from(checkedItems)));
  }, [cookbook, weekPlan, settings, checkedItems]);

  // Update editable ingredients/title when changing tabs in RESULTS mode
  useEffect(() => {
    if (appState === AppState.RESULTS && analysis) {
      setCurrentIngredients(analysis.variations[activeTab].ingredients);
      setCurrentTitle(analysis.title);
    }
  }, [activeTab, appState, analysis]);

  // Update editable ingredients/title when changing tabs in COOKBOOK mode
  useEffect(() => {
    if (appState === AppState.COOKBOOK && selectedRecipeId) {
        const recipe = cookbook.find(r => r.id === selectedRecipeId);
        if (recipe) {
            setCurrentIngredients(recipe.analysis.variations[activeTab].ingredients);
            setCurrentTitle(recipe.title);
        }
    }
  }, [activeTab, selectedRecipeId, appState]); 

  // --- Calculations ---

  const calculateTotalMacros = (ingredients: IngredientItem[]): MacroData => {
    return ingredients.reduce((acc, curr) => ({
      calories: acc.calories + (Number(curr.calories) || 0),
      protein: acc.protein + (Number(curr.protein) || 0),
      fat: acc.fat + (Number(curr.fat) || 0),
      carbs: acc.carbs + (Number(curr.carbs) || 0)
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  };

  const currentMacros = calculateTotalMacros(currentIngredients);

  // --- Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          const base64Content = base64String.split(',')[1]; 
          setSelectedImages(prev => [...prev, base64Content]);
        };
        // Explicitly cast file to Blob to avoid unknown type error
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  const removeImage = (index: number) => {
      setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    setIsLoading(true);
    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    try {
      const result = await analyzeRecipeWithGemini(settings, selectedImages, textInput);
      setAnalysis(result);
      setAppState(AppState.RESULTS);
      setActiveTab('Balanced'); // Default tab
    } catch (err: any) {
      setErrorMsg(err.message);
      setAppState(AppState.ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async () => {
      if (!refineText.trim()) return;
      
      // Determine which analysis object to use
      const baseAnalysis = appState === AppState.RESULTS ? analysis : cookbook.find(r => r.id === selectedRecipeId)?.analysis;
      
      if (!baseAnalysis) return;

      setIsRefining(true);
      try {
        const result = await refineRecipeWithGemini(settings, baseAnalysis, refineText);
        
        if (appState === AppState.RESULTS) {
            setAnalysis(result);
        } else if (appState === AppState.COOKBOOK && selectedRecipeId) {
            // Update cookbook directly if we are in edit mode
            setCookbook(prev => prev.map(r => r.id === selectedRecipeId ? { ...r, analysis: result, title: result.title } : r));
        }
        
        setRefineText("");
        // The useEffects will trigger and update currentIngredients/Title
      } catch (err: any) {
        alert("Refinement failed: " + err.message);
      } finally {
        setIsRefining(false);
      }
  };

  const handleIngredientChange = (index: number, field: keyof IngredientItem, value: string | number) => {
    const newIngredients = [...currentIngredients];
    newIngredients[index] = {
      ...newIngredients[index],
      [field]: value
    };
    setCurrentIngredients(newIngredients);
  };

  const handleRemoveIngredient = (index: number) => {
    const newIngredients = currentIngredients.filter((_, i) => i !== index);
    setCurrentIngredients(newIngredients);
  };

  const saveNewRecipe = () => {
    if (!analysis) return;
    
    // Create a copy of analysis but with the current edits applied to the active tab
    const finalAnalysis = {
        ...analysis,
        title: currentTitle,
        variations: {
            ...analysis.variations,
            [activeTab]: {
                ...analysis.variations[activeTab],
                ingredients: currentIngredients
            }
        }
    };
    
    const newRecipe: SavedRecipe = {
      id: Date.now().toString(),
      title: currentTitle,
      timestamp: Date.now(),
      analysis: finalAnalysis
    };
    
    setCookbook(prev => [newRecipe, ...prev]);
    setTextInput('');
    setSelectedImages([]);
    setAppState(AppState.COOKBOOK);
    setSelectedRecipeId(newRecipe.id);
  };

  const updateExistingRecipe = () => {
      if (!selectedRecipeId) return;
      setCookbook(prev => prev.map(r => {
          if (r.id === selectedRecipeId) {
              return {
                  ...r,
                  title: currentTitle,
                  analysis: {
                      ...r.analysis,
                      title: currentTitle,
                      variations: {
                          ...r.analysis.variations,
                          [activeTab]: {
                              ...r.analysis.variations[activeTab],
                              ingredients: currentIngredients // Save edits for current tab
                          }
                      }
                  }
              };
          }
          return r;
      }));
  };

  const assignToDate = (recipeId: string, variation: 'Proteins' | 'Balanced' | 'Carbs') => {
    if (!selectingForDate) return;
    
    const newPlanItem: DayPlan = { date: selectingForDate, recipeId, variation };
    
    setWeekPlan(prev => {
        // Remove existing entry for this date if exists
        const filtered = prev.filter(p => p.date !== selectingForDate);
        return [...filtered, newPlanItem];
    });

    setSelectingForDate(null);
    setAppState(AppState.HOME);
  };

  const clearDate = (date: string) => {
    setWeekPlan(prev => prev.filter(p => p.date !== date));
  };

  const toggleInventory = (key: keyof UserSettings['inventory']) => {
    setSettings(prev => ({
      ...prev,
      inventory: { ...prev.inventory, [key]: !prev.inventory[key] }
    }));
  };

  const toggleCheck = (id: string) => {
    const newSet = new Set(checkedItems);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setCheckedItems(newSet);
  };

  const changeWeek = (direction: 'prev' | 'next') => {
      setCurrentWeekStart(prev => addDays(prev, direction === 'next' ? 7 : -7));
  };

  // --- Renderers ---

  const renderBottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-6 pt-4 px-6 z-50">
      <div className="flex justify-around items-center max-w-md mx-auto">
        <button onClick={() => setAppState(AppState.HOME)} className={`flex flex-col items-center gap-1 ${appState === AppState.HOME || appState === AppState.SHOPPING_LIST ? 'text-indigo-400' : 'text-slate-500'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span className="text-[10px] font-bold uppercase">Planner</span>
        </button>
        
        <button onClick={() => setAppState(AppState.INPUT)} className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full -mt-8 shadow-lg shadow-indigo-500/40 transition-transform transform hover:scale-105 border-4 border-slate-900">
           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>

        <button onClick={() => {
            if (appState === AppState.COOKBOOK && selectedRecipeId) {
                setSelectedRecipeId(null); // Reset to list view if already in cookbook
            }
            setAppState(AppState.COOKBOOK);
        }} className={`flex flex-col items-center gap-1 ${appState === AppState.COOKBOOK ? 'text-indigo-400' : 'text-slate-500'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          <span className="text-[10px] font-bold uppercase">Cookbook</span>
        </button>
      </div>
    </div>
  );

  const renderRefinementInput = () => (
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mt-4">
          <h3 className="text-xs font-bold text-indigo-400 uppercase mb-2">Refine with AI</h3>
          <div className="flex gap-2">
              <input 
                type="text" 
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder="e.g. 'Add mushrooms', 'Make it spicy'"
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
              />
              <button 
                onClick={handleRefine}
                disabled={isRefining || !refineText}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white p-2 rounded-lg transition-colors"
              >
                  {isRefining ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  )}
              </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Use AI to add ingredients or change portions.</p>
      </div>
  );

  const renderPlanner = () => {
      const days = Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(currentWeekStart, i);
          return {
              dateObj: d,
              dateStr: formatDate(d),
              dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
              dayNum: d.getDate()
          };
      });

      const weekNum = getWeekNumber(currentWeekStart);
      const weekEnd = addDays(currentWeekStart, 6);

      return (
        <div className="space-y-6 animate-fade-in pb-20">
          <div className="flex justify-between items-center">
             <div>
                <h2 className="text-2xl font-bold text-white">Week {weekNum}</h2>
                <p className="text-xs text-slate-400">{currentWeekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}</p>
             </div>
             <div className="flex gap-2">
                 <button onClick={() => changeWeek('prev')} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                 </button>
                 <button onClick={() => changeWeek('next')} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                 </button>
             </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Weekly Plan</span>
            <button 
                onClick={() => setAppState(AppState.SHOPPING_LIST)}
                className="flex items-center gap-1 text-indigo-400 text-xs font-bold uppercase bg-indigo-900/30 px-3 py-1.5 rounded-lg border border-indigo-500/30"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                Shopping List
            </button>
          </div>
          
          <div className="space-y-3">
            {days.map((day) => {
              const plan = weekPlan.find(p => p.date === day.dateStr);
              const assignedRecipe = plan ? cookbook.find(r => r.id === plan.recipeId) : null;

              const isToday = day.dateStr === formatDate(new Date());

              return (
                <div key={day.dateStr} className={`bg-slate-800 rounded-xl p-4 border flex items-center gap-4 transition-all ${isToday ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'border-slate-700'}`}>
                  <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold text-sm ${isToday ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    <span className="text-[10px] uppercase">{day.dayName}</span>
                    <span className="text-lg leading-none">{day.dayNum}</span>
                  </div>
                  <div className="flex-1">
                    {assignedRecipe ? (
                      <div className="cursor-pointer" onClick={() => {
                        setSelectedRecipeId(assignedRecipe.id);
                        setActiveTab(plan?.variation || 'Balanced');
                        setAppState(AppState.COOKBOOK);
                      }}>
                        <h4 className="text-white font-medium text-sm truncate">{assignedRecipe.title}</h4>
                        <span className="text-[10px] text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded uppercase font-bold tracking-wide">{plan?.variation}</span>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-sm italic">Rest day / No Plan</span>
                    )}
                  </div>
                  {assignedRecipe ? (
                    <button onClick={(e) => { e.stopPropagation(); clearDate(day.dateStr); }} className="text-slate-500 hover:text-red-400 p-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  ) : (
                    <button 
                        onClick={() => {
                            setSelectingForDate(day.dateStr);
                            setAppState(AppState.RECIPE_SELECTOR);
                        }}
                        className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-indigo-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
  };

  const renderRecipeSelector = () => (
      <div className="space-y-6 animate-fade-in pb-20">
          <button onClick={() => { setSelectingForDate(null); setAppState(AppState.HOME); }} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
             Cancel
          </button>
          <h2 className="text-2xl font-bold text-white">Pick Meal for <span className="text-indigo-400">{selectingForDate}</span></h2>
          
          {cookbook.length === 0 ? (
             <div className="text-center py-12 text-slate-500">
                <p>Your cookbook is empty.</p>
                <button onClick={() => setAppState(AppState.INPUT)} className="mt-4 text-indigo-400 font-bold">Create a Recipe +</button>
             </div>
          ) : (
             <div className="grid grid-cols-1 gap-3">
                 {cookbook.map(recipe => (
                     <div key={recipe.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                         <h3 className="font-bold text-white mb-3">{recipe.title}</h3>
                         <div className="flex gap-2">
                             {(['Proteins', 'Balanced', 'Carbs'] as const).map(variant => (
                                 <button 
                                    key={variant}
                                    onClick={() => assignToDate(recipe.id, variant)}
                                    className="flex-1 text-xs py-2 rounded bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white transition-colors"
                                 >
                                    {variant}
                                 </button>
                             ))}
                         </div>
                     </div>
                 ))}
             </div>
          )}
      </div>
  );

  const renderShoppingList = () => {
    // Determine the date range for the currently viewed week (we use currentWeekStart from state)
    const start = currentWeekStart;
    const end = addDays(currentWeekStart, 6);
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    // Filter plans that fall within this week range
    const activePlans = weekPlan.filter(p => p.date >= startStr && p.date <= endStr && p.recipeId !== null);
    
    // Collect all ingredients
    const allIngredients: { date: string; title: string; item: IngredientItem; id: string }[] = [];
    activePlans.forEach(plan => {
        const recipe = cookbook.find(r => r.id === plan.recipeId);
        if (recipe && plan.variation) {
             recipe.analysis.variations[plan.variation].ingredients.forEach((ing, idx) => {
                 allIngredients.push({
                     date: plan.date,
                     title: recipe.title,
                     item: ing,
                     id: `${plan.date}-${recipe.id}-${idx}` // Unique ID for check state
                 });
             });
        }
    });

    const alphaSorted = [...allIngredients].sort((a, b) => a.item.item.localeCompare(b.item.item));
    const weekNum = getWeekNumber(currentWeekStart);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex justify-between items-center">
                <button onClick={() => setAppState(AppState.HOME)} className="flex items-center gap-2 text-slate-400 hover:text-white">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Planner
                </button>
                <div className="flex bg-slate-800 rounded-lg p-1">
                    <button 
                        onClick={() => setShoppingView('RECIPE')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${shoppingView === 'RECIPE' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                    >
                        Recipe
                    </button>
                    <button 
                        onClick={() => setShoppingView('ALPHA')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${shoppingView === 'ALPHA' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                    >
                        A-Z
                    </button>
                </div>
            </div>
            
            <div>
                <h2 className="text-2xl font-bold text-white">Shopping List</h2>
                <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                     <button onClick={() => changeWeek('prev')} className="hover:text-white">&lt;</button>
                     <span>Week {weekNum} ({start.toLocaleDateString()} - {end.toLocaleDateString()})</span>
                     <button onClick={() => changeWeek('next')} className="hover:text-white">&gt;</button>
                </div>
            </div>
            
            {activePlans.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                    <p>No meals planned for this specific week.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {shoppingView === 'RECIPE' ? (
                         // RECIPE VIEW
                        activePlans.sort((a,b) => a.date.localeCompare(b.date)).map(plan => {
                            const recipe = cookbook.find(r => r.id === plan.recipeId);
                            if (!recipe || !plan.variation) return null;
                            const variationData = recipe.analysis.variations[plan.variation];
                            // Format date "Mon 10"
                            const dObj = new Date(plan.date);
                            const dateLabel = `${dObj.toLocaleDateString('en-US', { weekday: 'short' })} ${dObj.getDate()}`;

                            return (
                                <div key={plan.date} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                                    <h3 className="text-indigo-400 font-bold text-sm uppercase mb-3 flex items-center justify-between">
                                        {dateLabel} - {recipe.title}
                                        <span className="text-[10px] bg-slate-900 px-2 py-1 rounded text-slate-500">{plan.variation}</span>
                                    </h3>
                                    <ul className="space-y-2">
                                        {variationData.ingredients.map((ing, i) => {
                                            const id = `${plan.date}-${recipe.id}-${i}`;
                                            const isChecked = checkedItems.has(id);
                                            return (
                                                <li 
                                                    key={id} 
                                                    onClick={() => toggleCheck(id)}
                                                    className={`flex items-center gap-3 text-sm cursor-pointer select-none group`}
                                                >
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 group-hover:border-indigo-500'}`}>
                                                        {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                    <div className={isChecked ? 'opacity-30 line-through' : ''}>
                                                        <span className="font-mono text-slate-500 w-16 inline-block text-right mr-2">{ing.amount}</span>
                                                        <span className="text-white">{ing.item}</span>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })
                    ) : (
                        // ALPHA VIEW
                        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                             <ul className="space-y-3 divide-y divide-slate-700/50">
                                {alphaSorted.map((entry, i) => {
                                    const isChecked = checkedItems.has(entry.id);
                                    const dObj = new Date(entry.date);
                                    const dateLabel = `${dObj.toLocaleDateString('en-US', { weekday: 'short' })} ${dObj.getDate()}`;
                                    return (
                                        <li 
                                            key={entry.id} 
                                            onClick={() => toggleCheck(entry.id)}
                                            className={`flex items-center gap-3 text-sm cursor-pointer select-none pt-2 first:pt-0`}
                                        >
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600'}`}>
                                                {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <div className={`flex-1 ${isChecked ? 'opacity-30 line-through' : ''}`}>
                                                <div className="flex justify-between">
                                                    <span className="text-white font-medium">{entry.item.item}</span>
                                                    <span className="font-mono text-slate-400 text-xs">{entry.item.amount}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-600">{dateLabel} • {entry.title}</div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
  };

  const renderCookbook = () => {
    if (selectedRecipeId) {
      // Detail View of Saved Recipe
      const recipe = cookbook.find(r => r.id === selectedRecipeId);
      if (!recipe) return <div>Recipe not found</div>;
      
      return (
        <div className="space-y-6 animate-fade-in pb-24">
           <div className="flex justify-between items-center">
                <button onClick={() => setSelectedRecipeId(null)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Back
                </button>
                <div className="flex gap-2">
                     <button 
                        onClick={updateExistingRecipe}
                        className="text-xs font-bold bg-green-600 text-white px-3 py-1.5 rounded-lg shadow hover:bg-green-500 transition-colors"
                     >
                        Save Changes
                     </button>
                </div>
           </div>
           
           {/* Editable Title */}
           <input 
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              className="text-2xl font-bold text-white bg-transparent border-b border-transparent focus:border-indigo-500 outline-none w-full"
           />

           {/* Mode Tabs */}
           <div className="bg-slate-800 p-1 rounded-xl flex gap-1">
             {(['Proteins', 'Balanced', 'Carbs'] as const).map(tab => (
               <button
                 key={tab}
                 onClick={() => setActiveTab(tab)}
                 className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                   activeTab === tab 
                   ? 'bg-indigo-600 text-white shadow-md' 
                   : 'text-slate-400 hover:text-white hover:bg-slate-700'
                 }`}
               >
                 {tab}
               </button>
             ))}
           </div>
           
           <MacroChart macros={currentMacros} targetCalories={settings.targetCalories} targetProtein={settings.targetProtein} targetCarbs={settings.targetCarbs} />
           
           {/* Ingredient Table */}
           <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
               <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">Ingredients</h3>
                      <div className="flex items-center gap-1 bg-slate-700 px-2 py-0.5 rounded text-xs text-slate-300 font-bold">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          <span>2</span>
                      </div>
                   </div>
                   <span className="text-xs text-slate-500 italic">Editable</span>
               </div>
               <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap table-fixed">
                       <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
                           <tr>
                               <th className="p-3 w-16">Amt</th>
                               <th className="p-3">Item</th>
                               <th className="p-3 text-right w-10">K</th>
                               <th className="p-3 text-right w-9">P</th>
                               <th className="p-3 text-right w-9">C</th>
                               <th className="p-3 text-right w-9">F</th>
                               <th className="p-3 w-8"></th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-700">
                           {currentIngredients.map((ing, i) => (
                               <tr key={i} className="hover:bg-slate-700/50 group">
                                   <td className="p-2">
                                       <input 
                                           className="w-full bg-transparent text-indigo-300 font-mono focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                           value={ing.amount}
                                           onChange={(e) => handleIngredientChange(i, 'amount', e.target.value)}
                                       />
                                   </td>
                                   <td className="p-2">
                                       <input 
                                           className="w-full bg-transparent text-white font-medium focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-ellipsis"
                                           value={ing.item}
                                           onChange={(e) => handleIngredientChange(i, 'item', e.target.value)}
                                       />
                                   </td>
                                   <td className="p-2 text-right">
                                       <input 
                                           type="number"
                                           className="w-full bg-transparent text-slate-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                           value={ing.calories}
                                           onChange={(e) => handleIngredientChange(i, 'calories', e.target.value)}
                                       />
                                   </td>
                                   <td className="p-2 text-right">
                                       <input 
                                           type="number"
                                           className="w-full bg-transparent text-blue-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                           value={ing.protein}
                                           onChange={(e) => handleIngredientChange(i, 'protein', e.target.value)}
                                       />
                                   </td>
                                   <td className="p-2 text-right">
                                       <input 
                                           type="number"
                                           className="w-full bg-transparent text-yellow-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                           value={ing.carbs}
                                           onChange={(e) => handleIngredientChange(i, 'carbs', e.target.value)}
                                       />
                                   </td>
                                   <td className="p-2 text-right">
                                       <input 
                                           type="number"
                                           className="w-full bg-transparent text-red-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                           value={ing.fat}
                                           onChange={(e) => handleIngredientChange(i, 'fat', e.target.value)}
                                       />
                                   </td>
                                   <td className="p-2 text-center">
                                       <button onClick={() => handleRemoveIngredient(i)} className="text-slate-600 hover:text-red-500">
                                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                       </button>
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           </div>

            {/* Refinement Input */}
            {renderRefinementInput()}

           <div className="space-y-4">
              <h3 className="text-lg font-bold text-white px-2">Instructions</h3>
              <div className="space-y-0">
                  {recipe.analysis.variations[activeTab].steps.map((step, i) => (
                      <StepTimer key={i} step={step} index={i} />
                  ))}
              </div>
           </div>
        </div>
      );
    }

    // List View
    return (
      <div className="space-y-6 animate-fade-in pb-20">
        <h2 className="text-2xl font-bold text-white">Cookbook</h2>
        {cookbook.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            <p>No saved recipes yet.</p>
            <button onClick={() => setAppState(AppState.INPUT)} className="mt-4 text-indigo-400 font-bold">Refactor a Recipe +</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {cookbook.map(recipe => {
              const displayMacros = calculateTotalMacros(recipe.analysis.variations['Balanced'].ingredients);
              return (
                <div 
                  key={recipe.id} 
                  onClick={() => {
                      setSelectedRecipeId(recipe.id);
                      setActiveTab('Balanced'); // Default open to Balanced
                  }}
                  className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-indigo-500 transition-all cursor-pointer group"
                >
                  <div className="flex justify-between items-start">
                      <div>
                          <h3 className="font-bold text-white group-hover:text-indigo-400 transition-colors">{recipe.title}</h3>
                          <p className="text-xs text-slate-500 mt-1">{new Date(recipe.timestamp).toLocaleDateString()}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 bg-slate-700 rounded text-slate-300 uppercase">
                          3 Versions
                      </span>
                  </div>
                  <div className="mt-4 flex gap-4 border-t border-slate-700 pt-3 opacity-70">
                      <div>
                          <span className="block text-[10px] text-slate-500 uppercase">Calories</span>
                          <span className="font-mono font-bold text-white">~{Math.round(displayMacros.calories)}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 italic self-end">
                          (Balanced view)
                      </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderResults = () => {
    if (!analysis) return null;

    return (
      <div className="space-y-6 animate-fade-in pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
             <input 
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                className="text-2xl font-bold text-white bg-transparent border-b border-transparent focus:border-indigo-500 outline-none w-full"
             />
             <button onClick={() => setAppState(AppState.INPUT)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
        </div>

        {/* Mode Tabs */}
        <div className="bg-slate-800 p-1 rounded-xl flex gap-1">
          {(['Proteins', 'Balanced', 'Carbs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Macro Chart (Live Calculation) */}
        <MacroChart 
            macros={currentMacros} 
            targetCalories={settings.targetCalories}
            targetProtein={settings.targetProtein}
            targetCarbs={settings.targetCarbs}
        />

        {/* Save Button */}
        <button 
            onClick={saveNewRecipe}
            className="w-full py-3 bg-white text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
        >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Add to Cookbook
        </button>

        {/* AI Notes */}
        <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl">
            <div className="flex items-start gap-3">
                <div className="mt-1 bg-indigo-500/20 p-1.5 rounded-full">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                    <h3 className="text-indigo-200 font-bold text-sm mb-1">Intelligence Strategy</h3>
                    <p className="text-indigo-100/80 text-sm leading-relaxed">{analysis.variations[activeTab].notes}</p>
                </div>
            </div>
        </div>

        {/* Editable Ingredients Table */}
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">Ingredients</h3>
                      <div className="flex items-center gap-1 bg-slate-700 px-2 py-0.5 rounded text-xs text-slate-300 font-bold">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          <span>2</span>
                      </div>
                   </div>
                <span className="text-xs text-slate-500 italic">Tap to edit</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap table-fixed">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
                        <tr>
                            <th className="p-3 w-16">Amt</th>
                            <th className="p-3">Item</th>
                            <th className="p-3 text-right w-10">K</th>
                            <th className="p-3 text-right w-9">P</th>
                            <th className="p-3 text-right w-9">C</th>
                            <th className="p-3 text-right w-9">F</th>
                            <th className="p-3 w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {currentIngredients.map((ing, i) => (
                            <tr key={i} className="hover:bg-slate-700/50 group">
                                <td className="p-2">
                                    <input 
                                        className="w-full bg-transparent text-indigo-300 font-mono focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                        value={ing.amount}
                                        onChange={(e) => handleIngredientChange(i, 'amount', e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        className="w-full bg-transparent text-white font-medium focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-ellipsis"
                                        value={ing.item}
                                        onChange={(e) => handleIngredientChange(i, 'item', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-right">
                                    <input 
                                        type="number"
                                        className="w-full bg-transparent text-slate-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                        value={ing.calories}
                                        onChange={(e) => handleIngredientChange(i, 'calories', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-right">
                                    <input 
                                        type="number"
                                        className="w-full bg-transparent text-blue-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                        value={ing.protein}
                                        onChange={(e) => handleIngredientChange(i, 'protein', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-right">
                                    <input 
                                        type="number"
                                        className="w-full bg-transparent text-yellow-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                        value={ing.carbs}
                                        onChange={(e) => handleIngredientChange(i, 'carbs', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-right">
                                    <input 
                                        type="number"
                                        className="w-full bg-transparent text-red-400 text-right focus:text-white focus:bg-slate-900 p-1 rounded outline-none border-b border-transparent focus:border-indigo-500 text-xs"
                                        value={ing.fat}
                                        onChange={(e) => handleIngredientChange(i, 'fat', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-center">
                                    <button onClick={() => handleRemoveIngredient(i)} className="text-slate-600 hover:text-red-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Refinement Input */}
        {renderRefinementInput()}

        {/* Steps with Timers */}
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-white px-2">Instructions</h3>
            <div className="space-y-0">
                {analysis.variations[activeTab].steps.map((step, i) => (
                    <StepTimer key={i} step={step} index={i} />
                ))}
            </div>
        </div>
      </div>
    );
  };

  const renderInput = () => (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 border-dashed flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-750 transition-colors" onClick={() => fileInputRef.current?.click()}>
         <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            multiple // Allow multiple
            className="hidden" 
         />
         <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mb-4 text-indigo-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
         </div>
         <h3 className="text-lg font-medium text-white">Upload Recipe Photos</h3>
         <p className="text-slate-400 text-sm mt-1">Select one or more screenshots</p>
      </div>

      {/* Thumbnail Grid */}
      {selectedImages.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
              {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                      <img src={`data:image/jpeg;base64,${img}`} className="w-full h-24 object-cover rounded-lg" alt={`Upload ${idx}`} />
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
              ))}
          </div>
      )}

      <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-900 text-slate-500">OR TYPE IT</span>
          </div>
      </div>

      <textarea
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        placeholder="Paste recipe text or list ingredients here..."
        className="w-full h-32 bg-slate-800 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
      />

      <button 
        onClick={handleAnalyze}
        disabled={!textInput && selectedImages.length === 0}
        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all ${
            (!textInput && selectedImages.length === 0) 
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-emerald-500/30 transform hover:scale-[1.02]'
        }`}
      >
        Generate Intelligence
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
      </button>
    </div>
  );

  const renderLoading = () => (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 animate-pulse">
          <div className="w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Composition...</h3>
              <p className="text-slate-400">Refactoring macros for Body Recomposition</p>
          </div>
      </div>
  );
  
  const renderRefiningOverlay = () => (
      <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-bold text-white">Refining with AI...</h3>
          <p className="text-slate-400 mt-2">Adjusting ingredients & macros</p>
      </div>
  );

  const renderError = () => (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-6">
          <div className="bg-red-500/10 p-6 rounded-full mb-6">
            <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Analysis Failed</h3>
          <p className="text-red-300 mb-8">{errorMsg || "Something went wrong with the Gemini API."}</p>
          <button 
            onClick={() => setAppState(AppState.INPUT)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
      </div>
  );
  
  const renderConfig = () => (
    <div className="space-y-6 animate-fade-in pb-20">
        <button onClick={() => setAppState(AppState.HOME)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
             Back to Planner
        </button>

      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Profile
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Weight (kg)</label>
            <input 
              type="number" 
              value={settings.weight}
              onChange={(e) => setSettings({...settings, weight: parseInt(e.target.value) || 0})}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Goal (kcal)</label>
            <input 
              type="number" 
              value={settings.targetCalories}
              onChange={(e) => setSettings({...settings, targetCalories: parseInt(e.target.value) || 0})}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Protein Floor</label>
                <div className="relative">
                    <input 
                    type="number" 
                    value={settings.targetProtein}
                    onChange={(e) => setSettings({...settings, targetProtein: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <div className="absolute right-3 top-3 text-slate-500 text-sm">g</div>
                </div>
             </div>
             <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Carb Floor</label>
                <div className="relative">
                    <input 
                    type="number" 
                    value={settings.targetCarbs}
                    onChange={(e) => setSettings({...settings, targetCarbs: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <div className="absolute right-3 top-3 text-slate-500 text-sm">g</div>
                </div>
             </div>
        </div>
        
        <div className="mt-4">
            <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Excluded Ingredients</label>
            <textarea 
                value={settings.excludedIngredients}
                onChange={(e) => setSettings({...settings, excludedIngredients: e.target.value})}
                placeholder="e.g. Mushrooms, Cilantro, Peanuts..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-20 resize-none"
            />
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            My Kitchen
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(settings.inventory).map(([key, val]) => (
            <button
              key={key}
              onClick={() => toggleInventory(key as keyof UserSettings['inventory'])}
              className={`p-3 rounded-lg text-sm font-medium border transition-all duration-200 ${
                val 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        
        {/* App Header (Sticky) */}
        <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white text-lg">33</div>
                <span className="font-bold text-lg tracking-tight">Recipe<span className="text-indigo-400">33</span></span>
             </div>
             <div className="flex items-center gap-3">
                 {appState === AppState.RESULTS && (
                     <div className="text-xs font-medium px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-400">
                         {settings.targetCalories}kcal Goal
                     </div>
                 )}
                 <button onClick={() => setAppState(AppState.CONFIG)} className="text-slate-500 hover:text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                 </button>
             </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6">
            {appState === AppState.HOME && renderPlanner()}
            {appState === AppState.SHOPPING_LIST && renderShoppingList()}
            {appState === AppState.RECIPE_SELECTOR && renderRecipeSelector()}
            {appState === AppState.COOKBOOK && renderCookbook()}
            {appState === AppState.CONFIG && renderConfig()}
            {appState === AppState.INPUT && renderInput()}
            {appState === AppState.ANALYZING && renderLoading()}
            {appState === AppState.RESULTS && renderResults()}
            {appState === AppState.ERROR && renderError()}
        </main>

        {/* Loading Overlay for Refinement */}
        {isRefining && renderRefiningOverlay()}

        {/* Bottom Nav - Visible on main screens */}
        {(appState === AppState.HOME || appState === AppState.COOKBOOK || appState === AppState.INPUT || appState === AppState.CONFIG || appState === AppState.SHOPPING_LIST) && renderBottomNav()}

      </div>
    </div>
  );
};

export default App;
