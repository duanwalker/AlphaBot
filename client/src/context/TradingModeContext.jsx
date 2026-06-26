import { createContext, useContext, useEffect, useState } from 'react';
import { getTradingMode, persistTradingMode } from '../services/userProfileApi';
import { setAxiosTradingMode } from '../services/axiosInstance';

const TradingModeContext = createContext({ tradingMode: 'paper', modeLoading: true, updateTradingMode: async () => {} });

export function TradingModeProvider({ children }) {
  const [tradingMode, setTradingModeState] = useState('paper');
  const [modeLoading, setModeLoading]       = useState(true);

  useEffect(() => {
    getTradingMode()
      .then(({ mode }) => {
        const resolved = mode ?? 'paper';
        setTradingModeState(resolved);
        setAxiosTradingMode(resolved);
      })
      .catch(() => {
        const local = localStorage.getItem('paperMode') === 'false' ? 'live' : 'paper';
        setTradingModeState(local);
        setAxiosTradingMode(local);
      })
      .finally(() => setModeLoading(false));
  }, []);

  async function updateTradingMode(mode) {
    await persistTradingMode(mode);
    setAxiosTradingMode(mode);
    localStorage.setItem('paperMode', mode === 'paper' ? 'true' : 'false');
    setTradingModeState(mode);
  }

  return (
    <TradingModeContext.Provider value={{ tradingMode, modeLoading, updateTradingMode }}>
      {children}
    </TradingModeContext.Provider>
  );
}

export function useTradingMode() {
  return useContext(TradingModeContext);
}
