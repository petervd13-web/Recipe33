import React, { useState, useEffect, useRef } from 'react';
import { CookingStep } from '../types';

interface StepTimerProps {
  step: CookingStep;
  index: number;
}

const StepTimer: React.FC<StepTimerProps> = ({ step, index }) => {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const hasTimer = step.timer_seconds && step.timer_seconds > 0;

  const startTimer = () => {
    if (!hasTimer) return;
    setTimeLeft(step.timer_seconds!);
    setIsActive(true);
    setIsFinished(false);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(null);
    setIsFinished(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
  };

  useEffect(() => {
    if (isActive && timeLeft !== null) {
      intervalRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev && prev > 1) return prev - 1;
          // Timer finished
          setIsActive(false);
          setIsFinished(true);
          window.clearInterval(intervalRef.current!);
          return 0;
        });
      }, 1000);
    } else if (!isActive && intervalRef.current) {
        window.clearInterval(intervalRef.current);
    }
    return () => {
        if(intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className={`relative pl-8 pb-8 border-l-2 ${isFinished ? 'border-green-500' : 'border-slate-700'} last:border-l-0 last:pb-0`}>
      <div className={`absolute -left-[9px] top-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isFinished ? 'bg-green-500 border-green-500' : 'bg-slate-900 border-slate-600'}`}>
        {isFinished && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
        )}
      </div>
      
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 bg-slate-800/50 p-4 rounded-lg">
        <div className="flex-1">
          <h4 className="text-slate-300 font-semibold mb-1 text-sm uppercase">Step {index + 1}</h4>
          <p className="text-slate-100 leading-relaxed">{step.text}</p>
        </div>

        {hasTimer && (
          <div className="flex-shrink-0 mt-2 sm:mt-0">
            {!isActive && !timeLeft && !isFinished && (
              <button 
                onClick={startTimer}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full font-medium text-sm transition-all shadow-lg shadow-indigo-500/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start {Math.ceil(step.timer_seconds! / 60)}m
              </button>
            )}

            {(isActive || (timeLeft !== null && !isFinished)) && (
               <div className="flex items-center gap-2">
                 <span className="font-mono text-2xl text-indigo-400 font-bold w-[80px] text-center">
                   {timeLeft !== null ? formatTime(timeLeft) : '0:00'}
                 </span>
                 <button onClick={resetTimer} className="text-slate-500 hover:text-white p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                 </button>
               </div>
            )}

            {isFinished && (
               <div className="flex items-center gap-2 animate-pulse">
                   <span className="text-green-400 font-bold text-sm uppercase tracking-wide">Done!</span>
                   <button onClick={resetTimer} className="text-xs text-slate-500 hover:text-white underline">
                       Reset
                   </button>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StepTimer;
