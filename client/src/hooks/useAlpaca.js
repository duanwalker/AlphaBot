import { useEffect, useState, useCallback } from "react";
import axios from "axios";

export default function useAlpaca() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderRefreshTrigger, setOrderRefreshTrigger] = useState(0);

  // Account and positions — fetched once on mount
  useEffect(() => {
    async function loadAccountAndPositions() {
      try {
        const [acctRes, posRes] = await Promise.all([
          axios.get("/api/alpaca/account"),
          axios.get("/api/alpaca/positions"),
        ]);
        setAccount(acctRes.data);
        setPositions(posRes.data);
      } catch (err) {
        setError(err.message || "Error loading Alpaca data");
      } finally {
        setLoading(false);
      }
    }
    loadAccountAndPositions();
  }, []);

  // Orders — re-fetched on mount and whenever orderRefreshTrigger increments
  useEffect(() => {
    async function loadOrders() {
      try {
        const ordRes = await axios.get("/api/alpaca/orders");
        setOrders(ordRes.data);
      } catch (err) {
        setError(prev => prev || err.message || "Error loading orders");
      }
    }
    loadOrders();
  }, [orderRefreshTrigger]);

  const refetchOrders = useCallback(() => {
    setOrderRefreshTrigger(t => t + 1);
  }, []);

  return { account, positions, orders, loading, error, refetchOrders };
}
