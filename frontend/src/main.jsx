import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import Dashboard from './pages/Dashboard'
import PayoffVsInvestPage from './pages/PayoffVsInvestPage'
import AlertsPage from './pages/AlertsPage'
import DividendPage from './pages/DividendPage'
import MortgagePage from './pages/MortgagePage'
import RetirementPage from './pages/RetirementPage'
import WorkStockPage from './pages/WorkStockPage'
import AssetsPage from './pages/AssetsPage'
import LiquidAssetsPage from './pages/LiquidAssetsPage'
import BrokeragePage from './pages/BrokeragePage'
import BudgetPage from './pages/BudgetPage'
import LoansPage from './pages/LoansPage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="watchlist" element={<Dashboard />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="dividends" element={<DividendPage />} />
          <Route path="mortgage" element={<MortgagePage />} />
          <Route path="strategy" element={<PayoffVsInvestPage />} />
          <Route path="budget"   element={<BudgetPage />} />
          <Route path="loans"    element={<LoansPage />} />
          <Route path="retirement" element={<RetirementPage />} />
          <Route path="workstock" element={<WorkStockPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="liquid" element={<LiquidAssetsPage />} />
          <Route path="brokerage" element={<BrokeragePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
