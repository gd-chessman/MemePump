import React from 'react';
import { io, Socket } from 'socket.io-client';

type ResolutionString = '1s' | '5s' | '15s' | '1' | '5' | '1h' | '4h' | '1D' | '1W' | '1MN';

// Function to fetch data from Solana Tracker API
const fetchChartData = async (tokenAddress: string, from: number, to: number, marketCap: boolean = false, resolution: ResolutionString) => {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/on-chain/chart/${tokenAddress}?market_cap=${marketCap ? 'marketcap' : 'price'}&type=${resolution}&time_from=${from}&time_to=${to}`;
    
    const authToken = localStorage.getItem('auth_token');
    const headers: HeadersInit = {};
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      headers
    });
    const data = await response.json();
    return data.data.oclhv.map((item: any) => ({
      time: item.time * 1000,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }));
  } catch (error) {
    console.error('Error fetching chart data:', error);
    return [];
  }
};

// Convert TradingView resolution to API resolution format
const convertResolution = (resolution: string): any => {
  switch (resolution) {
    case '1':
      return '1m';
    case '5':
      return '5m';
    case '60':
      return '1h';
    case '240':
      return '4h';
    default:
      return resolution as ResolutionString;
  }
};

// Convert timeframe to lowercase format for WebSocket
const formatTimeframe = (timeframe: ResolutionString): string => {
  return timeframe.replace(/([A-Z])/g, (match) => match.toLowerCase());
};

// Class MockDatafeed
export class MockDatafeed {
  private symbol: string;
  private tokenAddress: string;
  private resolution: ResolutionString;
  private showMarketCap: boolean;
  private isLoading: boolean = false;
  private lastRequestTime: number = 0;
  private requestTimeout: number = 1000;
  private socket: Socket | null = null;
  private subscribers: Map<string, (bar: any) => void> = new Map();
  private isConnected: boolean = false;
  private currentMarketCap: number | undefined;
  private handleMarketCapUpdate = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { marketCap, tokenAddress } = customEvent.detail;
    
    if (tokenAddress === this.tokenAddress) {
      this.currentMarketCap = marketCap;
      // Emit update to all subscribers when market cap changes
      if (this.showMarketCap && this.currentMarketCap) {
        // We need the last price data to calculate totalSupply
        // So we'll just update the close price for now
        this.subscribers.forEach((callback) => {
          callback({
            time: Date.now(),
            close: this.currentMarketCap,
            // Keep other values unchanged until we get new chart data
            open: undefined,
            high: undefined,
            low: undefined,
            volume: undefined
          });
        });
      }
    }
  };

  constructor(symbol: string, tokenAddress: string, resolution: ResolutionString, showMarketCap: boolean = false) {
    this.symbol = symbol;
    this.tokenAddress = tokenAddress;
    this.resolution = resolution;
    this.showMarketCap = showMarketCap;
    this.initializeWebSocket();
    this.initializeMarketCapListener();
  }

  private initializeMarketCapListener() {
    window.addEventListener('marketCapUpdate', this.handleMarketCapUpdate as EventListener);
  }

  private initializeWebSocket() {
    if (!this.tokenAddress) {
      return;
    }

    this.socket = io(`${process.env.NEXT_PUBLIC_API_URL}/chart`, {
      path: '/socket.io',
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      // Subscribe to chart updates when connected with formatted timeframe
      this.socket?.emit('subscribeToChart', {
        tokenAddress: this.tokenAddress,
        timeframe: formatTimeframe(convertResolution(this.resolution))
      });
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
    });

    this.socket.on('chartUpdate', (data) => { 
      if (this.showMarketCap && this.currentMarketCap) {
        // Calculate totalSupply to properly scale other values
        const totalSupply = this.currentMarketCap / data.data.close;
        const updatedData = {
          ...data.data,
          close: this.currentMarketCap,
          high: data.data.high * totalSupply,
          low: data.data.low * totalSupply,
          open: data.data.open * totalSupply,
        };
        this.subscribers.forEach((callback) => {
          callback(updatedData);
        });
      } else {
        // Use original data when not showing market cap
        this.subscribers.forEach((callback) => {
          callback(data.data);
        });
      }
    });

    this.socket.on('subscriptionError', (error) => {
      console.error('WebSocket subscription error:', error);
    });
  }

  onReady(callback: (config: any) => void) {
    setTimeout(() => callback({
      supported_resolutions: ['1s', '5s', '15s', '1', '5', '1h', '4h', '1D', '1W', '1MN'],
      exchanges: [
        {
          value: 'MEMEPUMP',
          name: 'MEMEPUMP',
          desc: 'MEMEPUMP',
        },
      ],
      symbols_types: [
        {
          name: 'crypto',
          value: 'crypto',
        },
      ],
    }));
  }

  searchSymbols(userInput: string, exchange: string, symbolType: string, onResultReadyCallback: (symbols: any[]) => void) {
    // For now, we'll just return the current symbol
    onResultReadyCallback([{
      symbol: this.symbol,
      full_name: this.symbol,
      description: this.symbol,
      exchange: 'MEMEPUMP',
      type: 'crypto',
    }]);
  }

  resolveSymbol(symbolName: string, onSymbolResolvedCallback: (symbolInfo: any) => void, onResolveErrorCallback: (error: any) => void) {
    setTimeout(() => {
      onSymbolResolvedCallback({
        name: symbolName,
        description: symbolName,
        type: 'crypto',
        session: '24x7',
        timezone: 'UTC',
        exchange: 'MEMEPUMP',
        minmov: 1,
        pricescale: 100000000, // Adjust based on your needs
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        supported_resolutions: ['1s', '5s', '15s', '1', '5', '1h', '4h', '1D', '1W', '1MN'],
        volume_precision: 8,
        data_status: 'streaming',
        has_intraday_seconds: true,
        has_seconds: true,
      });
    });
  }

  async getBars(symbolInfo: any, resolution: ResolutionString, periodParams: any, onHistoryCallback: (bars: any[], meta: any) => void, onErrorCallback: (error: any) => void) {
    try {
      const { from, to } = periodParams;
      const currentTime = Date.now();

      if (this.isLoading || (currentTime - this.lastRequestTime < this.requestTimeout)) {
        onHistoryCallback([], {
          noData: true,
        });
        return;
      }

      this.isLoading = true;
      this.lastRequestTime = currentTime;

      const apiResolution = convertResolution(resolution);
      const bars = await fetchChartData(this.tokenAddress, from, to, this.showMarketCap, apiResolution);
      
      this.isLoading = false;
      onHistoryCallback(bars, {
        noData: bars.length === 0,
      });
    } catch (error) {
      this.isLoading = false;
      console.error('Error in getBars:', error);
      onErrorCallback(error);
    }
  }

  subscribeBars(symbolInfo: any, resolution: ResolutionString, onRealtimeCallback: (bar: any) => void, subscriberUID: string, onResetCacheNeededCallback: () => void) {
    this.subscribers.set(subscriberUID, onRealtimeCallback);
    
    // If socket is not connected, try to reconnect
    if (!this.isConnected && !this.socket) {
      this.initializeWebSocket();
    }
  }

  unsubscribeBars(subscriberUID: string) {
    this.subscribers.delete(subscriberUID);
    
    // If no more subscribers, disconnect the socket and remove event listener
    if (this.subscribers.size === 0 && this.socket) {
      this.socket.emit('unsubscribeFromChart', { tokenAddress: this.tokenAddress });
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      window.removeEventListener('marketCapUpdate', this.handleMarketCapUpdate as EventListener);
    }
  }
}

export const formatNumber = (value: number): string => {
  if (value < 0.01) {
    const str = value.toFixed(10);
    const match = str.match(/^0\.(0*)([1-9].*)$/);
    if (match) {
      const [, zeros, rest] = match;
      const subscriptMap: { [key: string]: string } = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
      };
      const subscriptNumber = zeros.length.toString().split('').map(d => subscriptMap[d]).join('');
      return `0.0${subscriptNumber}${rest}`;
    }
  }
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toFixed(3);
}; 