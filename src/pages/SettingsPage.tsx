import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/AppShell'
import { Loading } from '../components/Feedback'
import type { Settings } from '../lib/types'
import { businessProfile } from '../lib/business'
import { Settings as SettingsIcon, Save } from 'lucide-react'

export function SettingsPage() {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('settings').select('*').maybeSingle()
    setSettings(data as Settings | null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const [form, setForm] = useState<Record<string, string>>({
    business_name: businessProfile.defaultName,
    address: businessProfile.addresses.join('\n'),
    phone: businessProfile.phone,
    gst_number: '',
    email: businessProfile.email,
    terms_conditions: '',
    bank_name: '',
    bank_account: '',
    bank_ifsc: '',
    upi_id: '',
  })

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name ?? businessProfile.defaultName,
        address: settings.address || businessProfile.addresses.join('\n'),
        phone: settings.phone || businessProfile.phone,
        gst_number: settings.gst_number ?? '',
        email: settings.email || businessProfile.email,
        terms_conditions: settings.terms_conditions ?? '',
        bank_name: settings.bank_name ?? '',
        bank_account: settings.bank_account ?? '',
        bank_ifsc: settings.bank_ifsc ?? '',
        upi_id: settings.upi_id ?? '',
      })
    }
  }, [settings])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    if (settings) {
      const { error } = await supabase.from('settings').update({ ...form, updated_at: new Date().toISOString() }).eq('id', settings.id)
      if (error) { toast(`Error: ${error.message}`, 'error'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('settings').insert(form)
      if (error) { toast(`Error: ${error.message}`, 'error'); setSaving(false); return }
    }
    toast('Settings saved successfully')
    setSaving(false)
    fetchData()
  }

  if (loading) return <Loading label="Loading settings..." />

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <div className="page-sub">Business information for invoices</div>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2"><SettingsIcon size={18} /> Business Information</div>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Business Name</label>
              <input className="form-input" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">GST Number</label>
              <input className="form-input" value={form.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-textarea" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><div className="card-title">Bank Details</div></div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Bank Name</label>
              <input className="form-input" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Account Number</label>
              <input className="form-input" value={form.bank_account} onChange={(e) => set('bank_account', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">IFSC Code</label>
              <input className="form-input" value={form.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">UPI ID</label>
              <input className="form-input" value={form.upi_id} onChange={(e) => set('upi_id', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><div className="card-title">Invoice Terms</div></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Terms & Conditions</label>
            <textarea className="form-textarea" style={{ minHeight: 100 }} value={form.terms_conditions} onChange={(e) => set('terms_conditions', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}
