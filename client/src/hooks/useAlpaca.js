import { useEffect, useState } from "react";
import axios from "axios";

export default function useAlpaca() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [acctRes, posRes, ordRes] = await Promise.all([
          axios.get("/api/alpaca/account"),
          axios.get("/api/alpaca/positions"),
          axios.get("/api/alpaca/orders"),
        ]);

        setAccount(acctRes.data);
        setPositions(posRes.data);
        setOrders(ordRes.data);
      } catch (err) {
        setError(err.message || "Error loading Alpaca data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { account, positions, orders, loading, error };
}
