
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { MacroData } from '../types';

interface MacroChartProps {
  macros: MacroData;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
}

// Blue (Protein), Yellow (Carbs), Red (Fat)
const COLORS = ['#3b82f6', '#eab308', '#ef4444'];

const MacroChart: React.FC<MacroChartProps> = ({ macros, targetCalories, targetProtein, targetCarbs }) => {
  
  // Ensure we don't pass NaN or negative values to the chart
  const safeVal = (val: number) => Math.max(0, val || 0);

  const data = [
    { name: 'Protein', value: safeVal(macros.protein), unit: 'g' },
    { name: 'Carbs', value: safeVal(macros.carbs), unit: 'g' },
    { name: 'Fat', value: safeVal(macros.fat), unit: 'g' },
  ];

  // Don't render chart if all values are 0
  const hasData = data.some(d => d.value > 0);

  // --- Logic Updates ---
  // Calories: Under target is GREEN (Good for dieting/control), Over target is GREY (Warning/Neutral)
  const isCaloriesGood = macros.calories <= targetCalories;
  
  // Protein/Carbs: Over target (hitting the floor) is GREEN (Good), Under is GREY (Missed target)
  const isProteinGood = macros.protein >= targetProtein;
  const isCarbsGood = macros.carbs >= targetCarbs;

  return (
    <div className="w-full bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 relative overflow-hidden">
      {/* Per Person Badge */}
      <div className="absolute top-0 left-0 bg-slate-700/80 px-2 py-1 rounded-br-lg text-[10px] text-slate-300 uppercase font-bold backdrop-blur-sm z-10 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        Per Person
      </div>

      <div className="flex justify-between items-center mb-4 mt-4">
        <div>
          <h3 className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Total</h3>
          <div className={`text-2xl font-bold ${isCaloriesGood ? 'text-green-400' : 'text-slate-400'}`}>
            {Math.round(macros.calories)} <span className="text-sm text-slate-400 font-normal">kcal</span>
          </div>
        </div>
        <div className="text-right">
            <div className="text-xs text-slate-500">Targets</div>
            <div className="flex flex-col items-end gap-0.5">
                 <span className={`text-xs font-bold ${isProteinGood ? 'text-green-400' : 'text-slate-500'}`}>
                    P: {targetProtein}g
                 </span>
                 <span className={`text-xs font-bold ${isCarbsGood ? 'text-green-400' : 'text-slate-500'}`}>
                    C: {targetCarbs}g
                 </span>
                 <span className={`text-xs font-bold ${isCaloriesGood ? 'text-green-400' : 'text-slate-500'}`}>
                    Cal: {targetCalories}
                 </span>
            </div>
        </div>
      </div>

      <div className="h-48 w-full relative">
        {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                >
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
                </Pie>
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(value: number) => [`${Math.round(value)}g`, '']}
                />
            </PieChart>
            </ResponsiveContainer>
        ) : (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                No macro data
            </div>
        )}
        
        {/* Centered Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400 font-medium">Macros</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 bg-slate-900/50 p-2 rounded-lg">
         <div className="flex flex-col items-center border-r border-slate-700/50">
             <span className="text-[10px] text-blue-400 uppercase font-bold mb-1">Protein</span>
             <span className="text-lg font-bold text-white">{Math.round(macros.protein)}g</span>
         </div>
         <div className="flex flex-col items-center border-r border-slate-700/50">
             <span className="text-[10px] text-yellow-400 uppercase font-bold mb-1">Carbs</span>
             <span className="text-lg font-bold text-white">{Math.round(macros.carbs)}g</span>
         </div>
         <div className="flex flex-col items-center">
             <span className="text-[10px] text-red-400 uppercase font-bold mb-1">Fat</span>
             <span className="text-lg font-bold text-white">{Math.round(macros.fat)}g</span>
         </div>
      </div>
    </div>
  );
};

export default MacroChart;
