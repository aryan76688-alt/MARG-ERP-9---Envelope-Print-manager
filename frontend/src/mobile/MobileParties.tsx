import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Phone, 
  PlusCircle, 
  ChevronRight, 
  RotateCcw,
  Sparkles,
  Building,
  ArrowRight,
  X
} from 'lucide-react';
import { fetchParties } from '../api/client';
import { Party } from '../types';

interface MobilePartiesProps {
  onNavigate: (tab: string, state?: any) => void;
}

export const MobileParties: React.FC<MobilePartiesProps> = ({ onNavigate }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);

  const loadParties = async (searchQuery: string = '') => {
    setLoading(true);
    try {
      const res = await fetchParties({
        page: 1,
        limit: 50,
        search: searchQuery.trim() || undefined,
      });
      setParties(res?.items || []);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error('Failed to load parties', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadParties(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleStartDispatch = (party: Party) => {
    onNavigate('new-job', { selectedParty: party });
  };

  return (
    <div className="space-y-3">
      {/* Sticky Search & Header */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Party Directory</h2>
            <p className="text-[10px] text-slate-400">
              {total > 0 ? `${total} Parties in Cloud Database` : 'Loading parties...'}
            </p>
          </div>
          <button
            onClick={() => loadParties(search)}
            className={`p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl active:scale-95 transition-all ${loading ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by English/Gujarati name, code, city..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Parties List */}
      <div className="space-y-2">
        {loading && parties.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            Loading parties from database...
          </div>
        ) : parties.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs bg-slate-900/60 rounded-2xl border border-slate-800">
            No parties found matching "{search}".
          </div>
        ) : (
          parties.map((party) => (
            <div
              key={party.id}
              className="p-3.5 bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-2xl transition-all space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-white leading-tight">
                    {party.party_name}
                  </div>
                  {party.party_name_gu && (
                    <div className="text-[11px] text-indigo-300 font-gujarati mt-0.5">
                      {party.party_name_gu}
                    </div>
                  )}
                </div>
                {party.party_code && (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono font-bold flex-shrink-0">
                    {party.party_code}
                  </span>
                )}
              </div>

              {/* Address & City */}
              <div className="text-[11px] text-slate-400 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="truncate leading-tight">
                  {party.address}{party.city ? `, ${party.city}` : ''}
                </span>
              </div>

              {/* Action Strip */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                {party.mobile_no ? (
                  <a
                    href={`tel:${party.mobile_no}`}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{party.mobile_no}</span>
                  </a>
                ) : (
                  <span className="text-[10px] text-slate-500">No phone</span>
                )}

                <button
                  type="button"
                  onClick={() => handleStartDispatch(party)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <span>Dispatch</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
