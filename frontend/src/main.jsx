import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AlertsPage from './pages/AlertsPage'
import HistoryPage from './pages/HistoryPage'
import DividendPage from './pages/DividendPage'
import MortgagePage from './pages/MortgagePage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="dividends" element={<DividendPage />} />
          <Route path="mortgage" element={<MortgagePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
