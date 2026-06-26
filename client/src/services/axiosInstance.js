import axios from 'axios';

const axiosInstance = axios.create();

// Safe default is always 'paper' — live mode must be explicitly set
let currentTradingMode = 'paper';

export function setAxiosTradingMode(mode) {
  currentTradingMode = mode;
}

axiosInstance.interceptors.request.use((config) => {
  config.headers['X-Trading-Mode'] = currentTradingMode;
  return config;
});

export default axiosInstance;
