import { useState } from "react";
import axios from "axios";

export default function useSymbolSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const searchSymbol = async (symbol) => {
    if (!symbol) return;

    try {
      setLoading(true);
      setError(null);

      const res = await axios.get(`/api/search/${symbol}`);
      const data = res.data;

      if (!data || data.error) {
        setError("Symbol not found");
        setResult(null);
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Search failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    result,
    searchSymbol,
  };
}
