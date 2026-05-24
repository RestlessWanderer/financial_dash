import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AlertsPage from './pages/AlertsPage'
import DividendPage from './pages/DividendPage'
import MortgagePage from './pages/MortgagePage'
import RetirementPage from './pages/RetirementPage'
import WorkStockPage from './pages/WorkStockPage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="dividends" element={<DividendPage />} />
          <Route path="mortgage" element={<MortgagePage />} />
          <Route path="retirement" element={<RetirementPage />} />
          <Route path="workstock" element={<WorkStockPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
