import { type ReactNode, useState, useEffect, createContext, useContext, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { businessProfile } from '../lib/business'
import {
  LayoutDashboard, Package, Warehouse, ShoppingCart, Receipt, Users, Truck,
  ShoppingBag, Wallet, BarChart3, Settings, Menu, X, FileText, ArrowLeftRight,
  Undo2, FileSpreadsheet, Boxes, Layers, Moon, Sun,
} from 'lucide-react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

const ToastContext = createContext<(message: string, type?: 'success' | 'error' | 'info') => void>(() => {})
export function useToast() { return useContext(ToastContext) }

const navItems = [
  { section: 'Main', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/products', label: 'Products', icon: Package },
    { to: '/slabs', label: 'Slabs', icon: Layers },
    { to: '/inventory', label: 'Inventory', icon: Warehouse },
  ]},
  { section: 'Sales', items: [
    { to: '/pos', label: 'Customer Sales / Billing', icon: ShoppingCart },
    { to: '/sales', label: 'Sales History', icon: Receipt },
    { to: '/quotations', label: 'Quotations', icon: FileText },
    { to: '/sales-returns', label: 'Sales Returns', icon: Undo2 },
  ]},
  { section: 'Purchase & Parties', items: [
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/suppliers', label: 'Suppliers', icon: Truck },
    { to: '/purchases', label: 'Purchases', icon: ShoppingBag },
    { to: '/purchase-returns', label: 'Purchase Returns', icon: Undo2 },
  ]},
  { section: 'Inventory Ops', items: [
    { to: '/stock-transfer', label: 'Stock Transfer', icon: ArrowLeftRight },
    { to: '/stock-ledger', label: 'Stock Ledger', icon: FileSpreadsheet },
  ]},
  { section: 'Finance', items: [
    { to: '/expenses', label: 'Expenses', icon: Wallet },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
  ]},
  { section: 'System', items: [
    { to: '/settings', label: 'Settings', icon: Settings },
  ]},
]

const marqueeItems = [
  { label: 'VAISHNAVI MARBLE', className: 'marquee-brand' },
  { label: 'Tiles', className: 'marquee-cyan' },
  { label: 'Sanitaryware', className: 'marquee-emerald' },
  { label: 'Kitchen Sink', className: 'marquee-blue' },
  { label: 'Bathroom Vanity', className: 'marquee-violet' },
  { label: 'Parking Tiles', className: 'marquee-yellow' },
  { label: 'Marble & Granite', className: 'marquee-pink' },
  { label: 'Kajaria', className: 'marquee-orange' },
  { label: 'Johnson', className: 'marquee-green' },
  { label: 'Jaquar', className: 'marquee-sky' },
  { label: 'Fortiva', className: 'marquee-purple' },
  { label: 'Somany', className: 'marquee-lime' },
  { label: 'Vitero', className: 'marquee-teal' },
  { label: 'Sika', className: 'marquee-rose' },
  { label: 'Hindware', className: 'marquee-amber' },
  { label: 'Parryware', className: 'marquee-red' },
  { label: 'Varmora', className: 'marquee-indigo' },
  { label: 'ROOF', className: 'marquee-sky' },
  { label: 'Nitco', className: 'marquee-lime' },
  { label: 'CERO', className: 'marquee-fuchsia' },
  { label: 'Lemovia', className: 'marquee-coral' },
  { label: 'Wonder Ceramic', className: 'marquee-peach' },
  { label: 'Bajaj Finserv', className: 'marquee-brand' },
  { label: '0 Down Payment*', className: 'marquee-sgreen' },
  { label: 'Easy EMI Available', className: 'marquee-gold' },
  { label: 'Premium Quality', className: 'marquee-white' },
  { label: 'Latest Designs', className: 'marquee-orange' },
  { label: 'Trusted Brands', className: 'marquee-emerald' },
  { label: 'Flexible Payment Options', className: 'marquee-cyan' },
  { label: '*Subject to eligibility & applicable terms', className: 'marquee-muted' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('vaishnav-theme') as 'light' | 'dark') ?? 'light'
  })

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    localStorage.setItem('vaishnav-theme', theme)
  }, [theme])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  const marqueeItemsFull = [...marqueeItems, ...marqueeItems]

  return (
    <ToastContext.Provider value={showToast}>
      <div className={`app-layout theme-${theme}`}>
        <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-brand">
            <img className="brand-icon" src={businessProfile.logoUrl} alt="Vaishnavi Marble logo" />
            <div>
              <div className="brand-name">Vaishnav Marble</div>
              <div className="brand-sub">Management System</div>
            </div>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((group) => (
              <div key={group.section}>
                <div className="nav-section-label">{group.section}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={(item as { end?: boolean }).end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <item.icon />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="main-area">
          <header className="topbar">
            <button className="menu-toggle" aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="topbar-brand-wrap">
              <img className="topbar-brand-logo" src={businessProfile.logoUrl} alt="Vaishnav Marble logo" />
              <h1>Vaishnav Marble</h1>
            </div>
            <div className="spacer" />
            <button className="theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              <span>{theme === 'light' ? 'Dark' : 'White'}</span>
            </button>
            <Boxes size={18} style={{ color: 'var(--text-muted)' }} />
            <span className="text-muted text-sm">Inventory & Billing System</span>
          </header>

          <div className="live-marquee-wrap">
            <div className="live-marquee-inner">
              <div className="live-marquee-track">
                {marqueeItemsFull.map((item, index) => (
                  <span key={`${item.label}-${index}`} className={item.className}>
                    {item.label}
                    {index !== marqueeItemsFull.length - 1 && <span className="marquee-separator">•</span>}
                  </span>
                ))}
              </div>
              <div className="live-marquee-track live-marquee-track-clone" aria-hidden="true">
                {marqueeItemsFull.map((item, index) => (
                  <span key={`clone-${item.label}-${index}`} className={item.className}>
                    {item.label}
                    {index !== marqueeItemsFull.length - 1 && <span className="marquee-separator">•</span>}
                  </span>
                ))}
              </div>
            </div>
            <div className="live-marquee-date-time">
              <span>📅 {currentDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <span>🕒 {currentDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>
          </div>

          <main key={location.pathname} className="page-content">
            {children}
          </main>
        </div>

        {/* Toasts */}
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: 'white',
                boxShadow: 'var(--shadow-lg)',
                animation: 'slideUp 0.2s ease',
                background: t.type === 'success' ? 'var(--success-600)' : t.type === 'error' ? 'var(--error-600)' : 'var(--info-600)',
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
