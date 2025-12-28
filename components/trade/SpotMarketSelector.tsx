'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import type { SpotMarket } from '../../app/(app)/trade/spot/types';
import { formatWithPrecision, safeDecimal, trimDecimal } from '../../app/(app)/trade/spot/utils';

type MarketSelectorStrings = {
  title: string;
  searchPlaceholder: string;
  favorites: string;
  all: string;
  quotes: string;
  empty: string;
  lastPrice: string;
  base: string;
  quote: string;
  minOrder: (value: string, asset: string) => string;
};

type SpotMarketSelectorProps = {
  open: boolean;
  markets: SpotMarket[];
  selectedMarket: string;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  strings: MarketSelectorStrings;
};

const FAVORITES_KEY = 'spot-favorite-markets';

export default function SpotMarketSelector({ open, markets, selectedMarket, onClose, onSelect, strings }: SpotMarketSelectorProps) {
  const [search, setSearch] = useState('');
  const [activeQuote, setActiveQuote] = useState<string>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(FAVORITES_KEY);
      if (stored) setFavorites(new Set(JSON.parse(stored)));
    } catch {
      // ignore malformed favorites
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
    } catch {
      // ignore persistence issues
    }
  }, [favorites]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    if (selectedMarket) {
      const match = markets.find((m) => m.symbol === selectedMarket);
      if (match) setActiveQuote(match.quote_asset);
    }
  }, [open, markets, selectedMarket]);

  const quoteFilters = useMemo(() => {
    const quotes = Array.from(new Set(markets.map((m) => m.quote_asset))).sort((a, b) => a.localeCompare(b));
    return ['all', ...quotes];
  }, [markets]);

  const showFavorites = favorites.size > 0 || activeQuote === 'favorites';

  const filteredMarkets = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return markets.filter((market) => {
      if (activeQuote === 'favorites' && !favorites.has(market.symbol)) return false;
      if (activeQuote !== 'all' && activeQuote !== 'favorites' && market.quote_asset.toLowerCase() !== activeQuote.toLowerCase()) return false;
      if (!normalized) return true;
      const haystack = `${market.symbol} ${market.base_asset} ${market.quote_asset}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [activeQuote, favorites, markets, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0a0d14] md:items-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0f1624] shadow-2xl shadow-black/50 md:rounded-2xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 md:px-6">
          <div className="flex flex-col gap-1">
            <span className="h-1 w-12 rounded-full bg-white/30 md:hidden" />
            <p className="text-sm font-semibold text-white md:text-base">{strings.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/25 bg-white/15 p-2 text-white transition hover:border-white/40 hover:bg-white/25"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-t border-white/10 bg-[#111827] px-4 py-3 shadow-inner shadow-black/20 md:border-none md:bg-[#0f1624] md:px-6 md:py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={strings.searchPlaceholder}
              className="w-full rounded-2xl border border-white/20 bg-[#0c111a] px-10 py-2 text-sm text-white placeholder:text-white/60 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{strings.quotes}</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              {showFavorites && (
                <button
                  type="button"
                  onClick={() => setActiveQuote('favorites')}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                    activeQuote === 'favorites'
                      ? 'border-amber-400/70 bg-amber-500/25 text-amber-50'
                      : 'border-white/20 bg-[#161f2f] text-white/90 hover:border-white/35 hover:text-white'
                  }`}
                >
                  <Star className="h-3.5 w-3.5 fill-current" />
                  <span>{strings.favorites}</span>
                </button>
              )}
              {quoteFilters.map((quote) => (
                <button
                  key={quote}
                  type="button"
                  onClick={() => setActiveQuote(quote)}
                  className={`rounded-full border px-3 py-1 transition ${
                    activeQuote === quote
                      ? 'border-cyan-400/70 bg-cyan-500/25 text-cyan-50'
                      : 'border-white/20 bg-[#161f2f] text-white/90 hover:border-white/35 hover:text-white'
                  }`}
                >
                  {quote === 'all' ? strings.all : quote}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">
          {filteredMarkets.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/25 bg-[#131b26] p-6 text-sm text-white/70">
              {strings.empty}
            </div>
          ) : (
            filteredMarkets.map((market) => {
              const pricePrecision = market.price_precision ?? 8;
              const lastPrice = market.last_price ? formatWithPrecision(safeDecimal(market.last_price), pricePrecision) : '—';
              const isFavorite = favorites.has(market.symbol);
              const isActive = market.symbol === selectedMarket;

              return (
                <button
                  key={market.symbol}
                  type="button"
                  onClick={() => onSelect(market.symbol)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition md:px-4 md:py-4 ${
                    isActive
                      ? 'border-cyan-400/70 bg-[#12324d] shadow-lg shadow-cyan-500/20'
                      : 'border-white/15 bg-[#131b26] hover:border-cyan-300/40 hover:bg-[#1a2433]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label="Toggle favorite"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFavorites((prev) => {
                            const next = new Set(prev);
                            if (next.has(market.symbol)) next.delete(market.symbol);
                            else next.add(market.symbol);
                            return next;
                          });
                        }}
                        className={`rounded-full p-2 transition ${
                          isFavorite ? 'text-amber-300 hover:bg-amber-500/15' : 'text-white/60 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                      </button>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white md:text-base">{market.symbol}</span>
                          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/70">
                            {strings.quote}: {market.quote_asset}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60 md:text-xs">
                          <span>
                            {strings.base}: {market.base_asset}
                          </span>
                          <span className="hidden text-white/30 md:inline">•</span>
                          <span>{strings.minOrder(trimDecimal(market.min_base_amount), market.base_asset)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white md:text-xl">{lastPrice}</div>
                      <div className="text-[11px] text-white/60">{strings.lastPrice}</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
