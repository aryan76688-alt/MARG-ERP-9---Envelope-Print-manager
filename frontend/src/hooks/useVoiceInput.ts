import { useState, useEffect, useRef, useCallback } from 'react';

export type VoiceLanguage = 'gu-IN' | 'hi-IN' | 'en-IN';

interface VoiceInputOptions {
  onResult?: (transcript: string, parsed?: { query: string; cases?: number; caseType?: string }) => void;
  defaultLang?: VoiceLanguage;
}

// Convert Indic numerals (Gujarati/Devanagari) to ASCII digits
export function normalizeIndicNumerals(text: string): string {
  const gujaratiNums: Record<string, string> = {
    '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4',
    '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9'
  };
  const hindiNums: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '૮': '8', '९': '9'
  };

  let res = text;
  for (const [k, v] of Object.entries(gujaratiNums)) {
    res = res.split(k).join(v);
  }
  for (const [k, v] of Object.entries(hindiNums)) {
    res = res.split(k).join(v);
  }
  return res;
}

// Helper to extract party search query and case count from voice transcription
export function parseVoiceInput(rawText: string): { query: string; cases?: number; caseType?: string } {
  const text = normalizeIndicNumerals(rawText.trim());

  // Pattern matching:
  // e.g. "Shreeji Medical 5 cases", "Shreeji Medical 5 liquid", "Patel Medical 3 કેસ", "Apollo 4 case"
  // Regex looks for a trailing number + optional case keyword
  const caseRegex = /(?:(\d+)\s*(?:cases?|case|કાર્ટુન|કેસ|બાકસ|બોક્સ|box|liquid|લીક્વીડ)?|\s+(?:cases?|case|કેસ)\s*(\d+))\s*$/i;

  const match = text.match(caseRegex);
  if (match) {
    const caseNum = parseInt(match[1] || match[2], 10);
    // Remove the trailing case portion to get the party name
    const cleanedQuery = text.replace(caseRegex, '').trim();

    let detectedType = 'standard';
    if (text.toLowerCase().includes('liquid') || text.includes('લીક્વીડ')) {
      detectedType = 'liquid';
    }

    return {
      query: cleanedQuery || text,
      cases: isNaN(caseNum) ? undefined : caseNum,
      caseType: detectedType
    };
  }

  return { query: text };
}

export function useVoiceInput({ onResult, defaultLang = 'gu-IN' }: VoiceInputOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState<VoiceLanguage>(defaultLang);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser/device.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const resultText = event.results[current][0].transcript;
      const normalized = normalizeIndicNumerals(resultText);
      setTranscript(normalized);

      const parsed = parseVoiceInput(normalized);
      if (onResult) {
        onResult(normalized, parsed);
      }
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please grant permission.');
      } else if (event.error !== 'no-speech') {
        setError(`Speech error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [language, onResult]);

  const startListening = useCallback(() => {
    setError(null);
    setTranscript('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = language;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: any) {
        console.warn('Recognition start error:', err);
        // If already started, stop then restart
        try {
          recognitionRef.current.stop();
        } catch {}
        setIsListening(false);
      }
    } else {
      setError('Speech recognition not available.');
    }
  }, [language]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  }, []);

  const isSupported = typeof window !== 'undefined' && 
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return {
    isListening,
    transcript,
    language,
    setLanguage,
    error,
    startListening,
    stopListening,
    isSupported,
  };
}
