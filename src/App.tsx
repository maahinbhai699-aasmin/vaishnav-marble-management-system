import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Dashboard } from './pages/Dashboard'
import { Products } from './pages/Products'
import { Slabs } from './pages/Slabs'
import { Inventory } from './pages/Inventory'
import { POS } from './pages/POS'
import { SalesHistory } from './pages/SalesHistory'
import { Customers } from './pages/Customers'
import { Suppliers } from './pages/Suppliers'
import { Purchases } from './pages/Purchases'
import { Expenses } from './pages/Expenses'
import { Reports } from './pages/Reports'
import { SettingsPage } from './pages/SettingsPage'
import { Quotations } from './pages/Quotations'
import { StockTransfer } from './pages/StockTransfer'
import { StockLedger } from './pages/StockLedger'
import { SalesReturns } from './pages/SalesReturns'
import { PurchaseReturns } from './pages/PurchaseReturns'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/slabs" element={<Slabs />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/sales" element={<SalesHistory />} />
          <Route path="/quotations" element={<Quotations />} />
          <Route path="/sales-returns" element={<SalesReturns />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/purchase-returns" element={<PurchaseReturns />} />
          <Route path="/stock-transfer" element={<StockTransfer />} />
          <Route path="/stock-ledger" element={<StockLedger />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}

export default App
