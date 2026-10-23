import React from 'react';
import { Search, Mic, MicOff, X, Globe } from 'lucide-react';
import { useVoiceInput, VoiceLanguage } from '../hooks/useVoiceInput';

interface VoiceSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

export const VoiceSearchInput: React.FC<VoiceSearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search by name, code, route...',
  className = '',
  inputClassName = '',
  autoFocus = false
}) => {
  const {
    isListening,
    language,
    setLanguage,
    startListening,
    stopListening,
    isSupported,
    error
  } = useVoiceInput({
    defaultLang: 'gu-IN',
    onResult: (text, parsed) => {
      const q = parsed?.query || text;
      onChange(q);
    }
  });

  const handleMicToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const cycleLanguage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const langs: VoiceLanguage[] = ['gu-IN', 'hi-IN', 'en-IN'];
    const nextIdx = (langs.indexOf(language) + 1) % langs.length;
    setLanguage(langs[nextIdx]);
  };

  const getLangLabel = () => {
    if (language === 'gu-IN') return 'ગુજ';
    if (language === 'hi-IN') return 'हिं';
    return 'EN';
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isListening ? 'Listening... બોલો...' : placeholder}
        autoFocus={autoFocus}
        className={`w-full pl-10 pr-24 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all ${
          isListening ? 'ring-2 ring-red-400 bg-red-50/50' : ''
        } ${inputClassName}`}
      />

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {isSupported && (
          <>
            <button
              type="button"
              onClick={cycleLanguage}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-500 bg-slate-200/80 hover:bg-slate-300 transition-colors flex items-center gap-0.5"
              title={`Voice Language: ${language} (Click to toggle)`}
            >
              <Globe className="w-2.5 h-2.5" />
              {getLangLabel()}
            </button>

            <button
              type="button"
              onClick={handleMicToggle}
              className={`p-1.5 rounded-lg transition-all ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30'
                  : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
              }`}
              title={isListening ? 'Stop listening' : 'Search with Voice (ગુજરાતી / Hindi / English)'}
            >
              {isListening ? (
                <MicOff className="w-4 h-4 animate-bounce" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          </>
        )}
      </div>

      {error && isListening && (
        <div className="absolute top-full left-0 right-0 mt-1 p-1.5 text-xs text-red-600 bg-red-50 rounded-lg border border-red-200 z-20">
          {error}
        </div>
      )}
    </div>
  );
};
