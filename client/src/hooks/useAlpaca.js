import { useEffect, useState, useCallback } from "react";
import axiosInstance from "../services/axiosInstance";
import { useTradingMode } from "../context/TradingModeContext";

export default function useAlpaca() {
  const { tradingMode, modeLoading } = useTradingMode();
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);

  const loadAccountAndPositions = useCallback(async () => {
    try {
      const [acctRes, posRes] = await Promise.all([
        axiosInstance.get("/api/alpaca/account"),
        axiosInstance.get("/api/alpaca/positions"),
      ]);
      setAccount(acctRes.data);
      setPositions(posRes.data);
    } catch (err) {
      setError(err.message || "Error loading Alpaca data");
    } finally {
      setLoading(false);
    }
  }, [tradingMode]);

  useEffect(() => {
    if (modeLoading) return;
    loadAccountAndPositions();
  }, [loadAccountAndPositions, modeLoading]);

  const loadOrders = useCallback(async () => {
    try {
      const ordRes = await axiosInstance.get("/api/alpaca/orders");
      setOrders(ordRes.data);
    } catch (err) {
      setError(prev => prev || err.message || "Error loading orders");
    }
  }, [orderRefreshTrigger, tradingMode]);

  useEffect(() => {
    if (modeLoading) return;
    loadOrders();
  }, [loadOrders, modeLoading]);

  const refetchOrders = useCallback(() => {
    setOrderRefreshTrigger(t => t + 1);
  }, []);

  const forceRefresh = useCallback(() => {
    loadAccountAndPositions();
    loadOrders();
  }, [loadAccountAndPositions, loadOrders]);

  return { account, positions, orders, loading, error, refetchOrders, forceRefresh };
}
