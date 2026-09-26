import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Brain, 
  Send, 
  X, 
  Maximize2, 
  Minimize2, 
  Bot, 
  Cpu
} from 'lucide-react';
import { chatWithBigBrain, fetchBrainStatus } from '../api/client';
import { BigBrainChatMessage, DualBrainStatus } from '../types';

interface Props {
  currentTab?: string;
  contextData?: any;
  onApplyLayoutAdvice?: (advice: any) => void;
}

export const BigBrainAssistant: React.FC<Props> = ({ currentTab = 'print', contextData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setBrainStatus] = useState<DualBrainStatus | null>(null);
  const [messages, setMessages] = useState<BigBrainChatMessage[]>([
    {
      role: 'assistant',
      content: '👋 Namaste! I am your **Big Brain AI Assistant** (powered by ChatGPT).\nI supervise UI design, layout formatting, PDF print styling, and logistics intelligence, while our **Gemini Small Brains** handle rapid backend translations and parcel processing.\nHow can I optimize your dispatches today?',
      model: 'ChatGPT Big Brain'
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchBrainStatus()
      .then(st => setBrainStatus(st))
      .catch(err => console.warn('Brain status load notice:', err));
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || loading) return;

    const userMsg: BigBrainChatMessage = {
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInputMessage('');
    setLoading(true);

    try {
      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await chatWithBigBrain({
        message: textToSend.trim(),
        history: historyPayload,
        context_data: {
          currentTab,
          ...(contextData || {})
        }
      });

      const assistantMsg: BigBrainChatMessage = {
        role: 'assistant',
        content: res.reply,
        model: res.model,
        notice: res.notice,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Note: ${err.message || 'Could not connect to Big Brain API'}. The system continues with built-in layout intelligence and Gemini Small Brains.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    'How do I fit long addresses on 2-up A4 envelopes?',
    'Explain the difference between MARG Grid and Attachment PDF',
    'How do the Big Brain and Gemini Small Brains coordinate?',
    'દહેગામ અને અમદાવાદના પાર્સલ માટે શ્રેષ્ઠ લેઆઉટ કયું છે?'
  ];

  return (
    <>
      {/* Floating launcher trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 text-white font-medium rounded-full shadow-2xl hover:shadow-purple-500/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 group"
          title="Open Big Brain AI Assistant"
        >
          <div className="relative">
            <Brain className="w-5 h-5 text-white animate-pulse" />
            <Sparkles className="w-3 h-3 text-yellow-300 absolute -top-1 -right-1" />
          </div>
          <span className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
            Big Brain AI
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          </span>
        </button>
      )}

      {/* Floating Chat & Advisor Drawer */}
      {isOpen && (
        <div 
          className={`fixed z-50 bg-slate-900 border border-purple-500/30 shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-300 backdrop-blur-xl ${
            isExpanded 
              ? 'bottom-4 right-4 w-[640px] h-[720px] max-w-[95vw] max-h-[92vh]' 
              : 'bottom-6 right-6 w-[400px] h-[550px] max-w-[92vw] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="p-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 border-b border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-200">
                <Brain className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-wide">Big Brain AI</h3>
                  <span className="px-1.5 py-0.5 text-[10px] uppercase font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded">
                    ChatGPT Core
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  UI Design • Print Controls • Logistics
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title={isExpanded ? 'Minimize' : 'Maximize'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dual Brain Architecture Health Indicator Banner */}
          <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 text-[11px] flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-purple-300 font-medium">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                <span>Big Brain:</span>
                <span className="text-emerald-400">GPT-4o-mini</span>
              </div>
              <div className="text-slate-600">|</div>
              <div className="flex items-center gap-1 text-blue-300 font-medium">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>Small Brains:</span>
                <span className="text-emerald-400">2x Gemini Pool</span>
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
              Active
            </span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-900/90 text-sm">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-purple-700/30 border border-purple-500/40 flex-shrink-0 flex items-center justify-center text-purple-300 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-none'
                      : 'bg-slate-800 border border-slate-700/80 text-slate-100 rounded-bl-none'
                  }`}
                >
                  {m.content}
                  {m.timestamp && (
                    <div className={`text-[10px] mt-1.5 opacity-60 flex items-center gap-1.5 ${m.role === 'user' ? 'justify-end text-purple-200' : 'justify-start text-slate-400'}`}>
                      <span>{m.timestamp}</span>
                      {m.model && <span className="italic">• {m.model}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-lg bg-purple-700/30 border border-purple-500/40 flex-shrink-0 flex items-center justify-center text-purple-300 mt-0.5 animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-2xl rounded-bl-none text-xs text-slate-300 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span>Big Brain analyzing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                disabled={loading}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] rounded-lg bg-slate-800/90 text-slate-300 hover:text-purple-300 hover:bg-slate-800 border border-slate-700 transition-colors flex-shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 bg-slate-950 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask Big Brain for layout tips, UI tweaks, or dispatch advice..."
                disabled={loading}
                className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !inputMessage.trim()}
                className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white rounded-xl transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
