'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { formatUnits, parseUnits } from 'ethers';
import {
  CreditCard,
  Coins,
  DollarSign,
  KeyRound,
  Layers,
  Loader2,
  LineChart,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useToast } from '../lib/toast';

type AdminRole = 'superadmin' | 'manager';

interface Admin {
  id: number;
  email: string;
  username: string;
  role: AdminRole;
  is_active?: boolean;
  last_login_at?: string | null;
}

type Section = 'overview' | 'admins' | 'users' | 'transactions' | 'staking' | 'pricing' | 'fees' | 'ai' | 'stripe';

interface SummaryResponse {
  summary: {
    total_users: number;
    total_admins: number;
    eltx_circulating_balance: { wei: string; display: string };
    staking_active: number;
    swap_volume: { count: number; eltx_wei: string; eltx: string };
    spot_trades: number;
    fiat_completed: { count: number; usd: string };
    confirmed_deposits: number;
  };
}

interface AdminUserRow extends Admin {
  created_at?: string;
  updated_at?: string;
}

interface UserRow {
  id: number;
  email: string;
  username: string;
  language: string;
  created_at: string;
  updated_at: string;
}

interface UserDetailResponse {
  user: UserRow;
  balances: Array<{ asset: string; balance: string; balance_wei: string; created_at: string }>;
  staking: Array<{ id: number; plan_name: string; amount: string; status: string; start_date: string; end_date: string }>;
  fiat: Array<{ id: number; status: string; usd_amount: string; eltx_amount: string; created_at: string }>;
  deposits: Array<{ id: number; asset: string; amount: string; status: string; created_at: string }>;
  transfers: Array<{ id: number; asset: string; amount: string; from_user_id: number; to_user_id: number; created_at: string }>;
}

interface StripeStatusResponse {
  ok: boolean;
  status: {
    enabled: boolean;
    reason?: string | null;
    publishableKey?: string | null;
    secretKey?: string | null;
    webhookSecret?: string | null;
    returnUrlBase?: string | null;
    successUrl?: string | null;
    cancelUrl?: string | null;
    minPurchaseUsd?: number;
    maxPurchaseUsd?: number | null;
    sdkReady?: boolean;
  };
}

type FeeSettings = { swap_fee_bps: number; spot_trade_fee_bps: number };

type FeeBalanceRow = { fee_type: 'swap' | 'spot'; asset: string; amount: string; amount_wei: string; entries: number };

type AiSettings = { daily_free_messages: number; message_price_eltx: string };
type AiStats = { messages_used: number; paid_messages: number; free_messages: number; eltx_spent: string; eltx_spent_wei: string };
type AiSettingsResponse = { settings: AiSettings; stats: AiStats; today?: string };

type SwapPricingRow = {
  asset: string;
  price_eltx: string;
  min_amount: string;
  max_amount: string | null;
  spread_bps: number;
  asset_reserve_wei: string;
  eltx_reserve_wei: string;
  asset_decimals: number;
  updated_at?: string | null;
};

type SpotMarketRow = {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  base_decimals: number;
  quote_decimals: number;
  min_base_amount: string;
  min_quote_amount: string;
  price_precision: number;
  amount_precision: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

const sections: Array<{ id: Section; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: ShieldCheck },
  { id: 'admins', label: 'Admin Users', icon: Users },
  { id: 'users', label: 'Customers', icon: Wallet },
  { id: 'transactions', label: 'Transactions', icon: LineChart },
  { id: 'staking', label: 'Staking', icon: Layers },
  { id: 'fees', label: 'Fees', icon: Coins },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'stripe', label: 'Stripe Purchases', icon: CreditCard },
];

function trimDecimalValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '0';
  const str = value.toString();
  if (!str.includes('.')) return str;
  const trimmed = str.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return normalized.length ? normalized : '0';
}

function formatReserve(wei: string | number | null | undefined, decimals = 18) {
  try {
    return trimDecimalValue(formatUnits(BigInt(String(wei ?? '0')), decimals));
  } catch {
    return '0';
  }
}

function toWeiString(amount: string, decimals = 18) {
  try {
    return parseUnits(amount, decimals).toString();
  } catch {
    return null;
  }
}

function SectionTabs({ active, onSelect }: { active: Section; onSelect: (section: Section) => void }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {sections.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              isActive
                ? 'border-blue-500 bg-blue-500/10 text-blue-200'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function AiPanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [stats, setStats] = useState<AiStats | null>(null);
  const [today, setToday] = useState<string>('');
  const [form, setForm] = useState<AiSettings>({ daily_free_messages: 10, message_price_eltx: '1' });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<AiSettingsResponse>('/admin/ai/settings');
    if (res.ok) {
      setSettings(res.data.settings);
      setStats(res.data.stats);
      setForm(res.data.settings);
      setToday(res.data.today || '');
    } else {
      onNotify(res.error || 'Failed to load AI settings', 'error');
    }
    setLoading(false);
  }, [onNotify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await apiFetch<AiSettingsResponse>('/admin/ai/settings', {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSettings(res.data.settings);
      setStats(res.data.stats);
      setForm(res.data.settings);
      setToday(res.data.today || '');
      onNotify('AI settings updated');
    } else {
      onNotify(res.error || 'Failed to update AI settings', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">AI configuration</p>
          <h2 className="text-xl font-semibold">Daily credits & billing</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
          {today && <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">{today}</span>}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/30"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-white/70">
            <span>Free messages per day</span>
            <input
              type="number"
              min={0}
              value={form.daily_free_messages}
              onChange={(e) => setForm({ ...form, daily_free_messages: Number(e.target.value) || 0 })}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-blue-300 focus:outline-none"
            />
          </label>
          <label className="space-y-2 text-sm text-white/70">
            <span>Price per extra message (ELTX)</span>
            <input
              type="text"
              value={form.message_price_eltx}
              onChange={(e) => setForm({ ...form, message_price_eltx: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-blue-300 focus:outline-none"
            />
          </label>
        </div>
        <div className="flex items-center justify-between text-xs text-white/60">
          <div className="space-y-1">
            <p>اضبط الكريدت اليومي المجاني وسعر الرسالة بعد نفاد المجاني.</p>
            <p>الأسعار تقبل أرقام عشرية (مثال 0.5 ELTX).</p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            احفظ التغييرات
          </button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">Messages used today</p>
          <p className="mt-2 text-2xl font-semibold">{loading || !stats ? '...' : stats.messages_used}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">Paid messages</p>
          <p className="mt-2 text-2xl font-semibold">{loading || !stats ? '...' : stats.paid_messages}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">Free messages (used)</p>
          <p className="mt-2 text-2xl font-semibold">{loading || !stats ? '...' : stats.free_messages}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">ELTX spent today</p>
          <p className="mt-2 text-2xl font-semibold">{loading || !stats ? '...' : `${stats.eltx_spent} ELTX`}</p>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onSubmit, loading }: { onSubmit: (identifier: string, password: string) => Promise<void>; loading: boolean }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <form
        className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit(identifier, password);
        }}
      >
        <div className="text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-blue-400" />
          <h1 className="mt-4 text-2xl font-semibold">ELTX Admin Access</h1>
          <p className="mt-2 text-sm text-white/60">Secure sign-in for operations and treasury team.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/70">Email or Username</label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
              placeholder="admin@eltx.online"
              required
            />
          </div>
          <div>
            <label className="text-sm text-white/70">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
              required
              minLength={8}
            />
          </div>
        </div>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-medium transition hover:bg-blue-500 disabled:opacity-60"
          disabled={loading}
        >
          <ShieldCheck className="h-4 w-4" />
          {loading ? 'Signing in…' : 'Sign in securely'}
        </button>
      </form>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon }: { title: string; value: string; subtitle?: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-white/60">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-white/50">{subtitle}</p>}
        </div>
        <Icon className="h-10 w-10 text-blue-400" />
      </div>
    </div>
  );
}

function OverviewPanel({ onError }: { onError: (message: string) => void }) {
  const [summary, setSummary] = useState<SummaryResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<SummaryResponse>('/admin/dashboard/summary');
    if (res.ok) {
      setSummary(res.data.summary);
    } else {
      onError(res.error || 'Failed to load summary');
    }
    setLoading(false);
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-red-200">
        Failed to load metrics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Registered users" value={summary.total_users.toLocaleString()} subtitle="Total customer accounts" icon={Users} />
        <StatCard title="Active admins" value={summary.total_admins.toString()} subtitle="Enabled admin accounts" icon={UserPlus} />
        <StatCard
          title="ELTX in circulation"
          value={`${summary.eltx_circulating_balance.display} ELTX`}
          subtitle={`${summary.swap_volume.count.toLocaleString()} swaps processed`}
          icon={Wallet}
        />
        <StatCard
          title="Swap volume"
          value={`${summary.swap_volume.eltx} ELTX`}
          subtitle="Lifetime swap conversions"
          icon={LineChart}
        />
        <StatCard
          title="Active staking"
          value={summary.staking_active.toLocaleString()}
          subtitle="Positions currently earning rewards"
          icon={Layers}
        />
        <StatCard
          title="Card purchases"
          value={`$${summary.fiat_completed.usd}`}
          subtitle={`${summary.fiat_completed.count.toLocaleString()} successful Stripe settlements`}
          icon={CreditCard}
        />
      </div>
      <button
        onClick={load}
        className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
      >
        <RefreshCw className="h-4 w-4" /> Refresh metrics
      </button>
    </div>
  );
}

function AdminUsersPanel({ admin, onNotify }: { admin: Admin; onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'manager' as AdminRole });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ admins: AdminUserRow[] }>('/admin/admin-users');
    if (res.ok) {
      setAdmins(res.data.admins);
    } else {
      onNotify(res.error || 'Failed to load admin users', 'error');
    }
    setLoading(false);
  }, [onNotify]);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = admin.role === 'superadmin';

  const handleCreate = async () => {
    if (!canManage) return;
    if (!form.email || !form.username || !form.password) {
      onNotify('Complete all fields before creating an admin', 'error');
      return;
    }
    setCreating(true);
    const res = await apiFetch<{ admin: AdminUserRow }>('/admin/admin-users', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (res.ok) {
      onNotify('Admin account created', 'success');
      setForm({ email: '', username: '', password: '', role: 'manager' });
      setAdmins((prev) => [res.data.admin, ...prev]);
    } else {
      onNotify(res.error || 'Failed to create admin', 'error');
    }
  };

  const updateAdmin = async (row: AdminUserRow, patch: Partial<AdminUserRow> & { password?: string }) => {
    const body: Record<string, unknown> = {};
    if (patch.email && patch.email !== row.email) body.email = patch.email;
    if (patch.username && patch.username !== row.username) body.username = patch.username;
    if (patch.role && patch.role !== row.role) body.role = patch.role;
    if (patch.is_active !== undefined && patch.is_active !== row.is_active) body.is_active = patch.is_active;
    if (patch.password) body.password = patch.password;
    if (!Object.keys(body).length) return;
    const res = await apiFetch<{ admin: AdminUserRow }>(`/admin/admin-users/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onNotify('Admin updated', 'success');
      setAdmins((prev) => prev.map((item) => (item.id === row.id ? res.data.admin : item)));
    } else {
      onNotify(res.error || 'Update failed', 'error');
    }
  };

  return (
    <div className="space-y-8">
      {canManage && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold">Invite a new admin</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs uppercase text-white/60">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                type="email"
                placeholder="ops@eltx.online"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-white/60">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                placeholder="eltx.ops"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-white/60">Password</label>
              <input
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                type="password"
                minLength={12}
                placeholder="At least 12 characters"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-white/60">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as AdminRole }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
              >
                <option value="manager">Manager</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-4 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {creating ? 'Creating…' : 'Create admin'}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-lg font-semibold">Current admin roster</h3>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/60">Admin</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/60">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/60">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/60">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {admins.map((row) => {
                  const isSelf = row.id === admin.id;
                  return (
                    <tr key={row.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{row.username}</div>
                        <div className="text-xs text-white/60">{row.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          disabled={!canManage || isSelf}
                          value={row.role}
                          onChange={(e) => updateAdmin(row, { role: e.target.value as AdminRole })}
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
                        >
                          <option value="manager">Manager</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={!canManage && !isSelf}
                          onClick={() => updateAdmin(row, { is_active: !row.is_active })}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            row.is_active
                              ? 'bg-emerald-500/10 text-emerald-200'
                              : 'bg-red-500/10 text-red-200'
                          } ${!canManage && !isSelf ? 'opacity-60' : 'hover:opacity-80'}`}
                        >
                          {row.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              const nextPassword = window.prompt('Set a new password for this admin (min 12 chars)');
                              if (!nextPassword) return;
                              if (nextPassword.length < 12) {
                                onNotify('Password must be at least 12 characters', 'error');
                                return;
                              }
                              updateAdmin(row, { password: nextPassword });
                            }}
                            className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                          >
                            <KeyRound className="h-3 w-3" /> Reset password
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersPanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [query, setQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [details, setDetails] = useState<UserDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const search = useCallback(
    async (q: string) => {
      setLoadingList(true);
      const res = await apiFetch<{ users: UserRow[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (res.ok) {
        setUsers(res.data.users);
      } else {
        onNotify(res.error || 'Search failed', 'error');
      }
      setLoadingList(false);
    },
    [onNotify]
  );

  const loadUser = useCallback(
    async (user: UserRow) => {
      setLoadingDetail(true);
      const res = await apiFetch<UserDetailResponse>(`/admin/users/${user.id}`);
      if (res.ok) {
        setDetails(res.data);
        setSelected(user);
      } else {
        onNotify(res.error || 'Failed to load user details', 'error');
      }
      setLoadingDetail(false);
    },
    [onNotify]
  );

  const updateUser = async (payload: Partial<UserRow>) => {
    if (!selected) return;
    const res = await apiFetch<{ user: UserRow }>(`/admin/users/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      onNotify('User updated', 'success');
      setUsers((prev) => prev.map((u) => (u.id === res.data.user.id ? res.data.user : u)));
      await loadUser(res.data.user);
    } else {
      onNotify(res.error || 'Update failed', 'error');
    }
  };

  const adjustBalance = async (payload: { asset: string; amount: string; direction: 'credit' | 'debit'; reason?: string }) => {
    if (!selected) return;
    const res = await apiFetch(`/admin/users/${selected.id}/balances/adjust`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      onNotify('Balance updated', 'success');
      await loadUser(selected);
    } else {
      onNotify(res.error || 'Balance change failed', 'error');
    }
  };

  const resetPassword = async () => {
    if (!selected) return;
    const password = window.prompt('Enter a new password for this user (min 8 characters)');
    if (!password) return;
    if (password.length < 8) {
      onNotify('Password must be at least 8 characters', 'error');
      return;
    }
    const res = await apiFetch(`/admin/users/${selected.id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      onNotify('User password updated', 'success');
    } else {
      onNotify(res.error || 'Password reset failed', 'error');
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold">Search users</h3>
        <div className="mt-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Email or username"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => search(query)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
          >
            <RefreshCw className="h-4 w-4" /> Search
          </button>
        </div>
        <div className="mt-6 max-h-96 overflow-y-auto rounded-xl border border-white/5">
          {loadingList ? (
            <div className="flex h-40 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : users.length ? (
            <ul className="divide-y divide-white/10">
              {users.map((user) => (
                <li key={user.id}>
                  <button
                    onClick={() => loadUser(user)}
                    className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition hover:bg-white/5 ${
                      selected?.id === user.id ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-white">{user.username}</span>
                    <span className="text-xs text-white/60">{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6 text-center text-sm text-white/60">Use the search bar to find users.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        {loadingDetail ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : details && selected ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">{selected.username}</h3>
                <p className="text-sm text-white/60">{selected.email}</p>
              </div>
              <button
                onClick={resetPassword}
                className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
              >
                <KeyRound className="h-3 w-3" /> Reset password
              </button>
            </div>

            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                updateUser({
                  email: formData.get('email') as string,
                  username: formData.get('username') as string,
                  language: formData.get('language') as string,
                });
              }}
            >
              <div className="md:col-span-2">
                <label className="text-xs uppercase text-white/60">Email</label>
                <input
                  name="email"
                  defaultValue={selected.email}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                  type="email"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-white/60">Username</label>
                <input
                  name="username"
                  defaultValue={selected.username}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-white/60">Language</label>
                <input
                  name="language"
                  defaultValue={selected.language}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
                >
                  <ShieldCheck className="h-4 w-4" /> Save profile
                </button>
              </div>
            </form>

            <div>
              <h4 className="text-sm font-semibold uppercase text-white/60">Balances</h4>
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="px-3 py-2 text-left font-medium text-white/60">Asset</th>
                      <th className="px-3 py-2 text-right font-medium text-white/60">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {details.balances.map((balance) => (
                      <tr key={balance.asset}>
                        <td className="px-3 py-2">{balance.asset}</td>
                        <td className="px-3 py-2 text-right font-mono text-sm text-white/80">{balance.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form
                className="mt-4 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  adjustBalance({
                    asset: (formData.get('asset') as string) || 'ELTX',
                    amount: (formData.get('amount') as string) || '0',
                    direction: (formData.get('direction') as 'credit' | 'debit') || 'credit',
                    reason: (formData.get('reason') as string) || undefined,
                  });
                }}
              >
                <div>
                  <label className="text-xs uppercase text-white/60">Asset</label>
                  <input
                    name="asset"
                    defaultValue="ELTX"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-white/60">Amount</label>
                  <input
                    name="amount"
                    placeholder="1000"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-white/60">Direction</label>
                  <select
                    name="direction"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="credit">Credit</option>
                    <option value="debit">Debit</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase text-white/60">Reason</label>
                  <input
                    name="reason"
                    placeholder="Manual adjustment"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500"
                  >
                    <DollarSign className="h-4 w-4" /> Apply balance change
                  </button>
                </div>
              </form>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-xs uppercase text-white/60">Recent deposits</h4>
                <ul className="mt-2 space-y-2 text-xs text-white/70">
                  {details.deposits.slice(0, 6).map((dep) => (
                    <li key={dep.id} className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <div className="font-medium text-white/80">{dep.asset}</div>
                      <div>{dep.amount}</div>
                      <div className="text-[10px] uppercase text-white/40">{dep.status} • {new Date(dep.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs uppercase text-white/60">Transfers</h4>
                <ul className="mt-2 space-y-2 text-xs text-white/70">
                  {details.transfers.slice(0, 6).map((tx) => (
                    <li key={tx.id} className="rounded-lg border border-white/10 bg-black/30 p-2">
                      <div className="font-medium text-white/80">{tx.asset} — {tx.amount}</div>
                      <div>From #{tx.from_user_id} to #{tx.to_user_id}</div>
                      <div className="text-[10px] uppercase text-white/40">{new Date(tx.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-60 flex-col items-center justify-center text-sm text-white/60">
            <Users className="mb-3 h-10 w-10 text-blue-400" />
            Select a user to see full details.
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionsPanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const types: Array<{ id: 'deposits' | 'transfers' | 'swaps' | 'spot' | 'fiat'; label: string }> = [
    { id: 'deposits', label: 'Deposits' },
    { id: 'transfers', label: 'Internal transfers' },
    { id: 'swaps', label: 'Swaps' },
    { id: 'spot', label: 'Spot trades' },
    { id: 'fiat', label: 'Stripe purchases' },
  ];
  const [active, setActive] = useState<(typeof types)[number]['id']>('deposits');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  const load = useCallback(
    async (type: (typeof types)[number]['id']) => {
      setLoading(true);
      const res = await apiFetch<{ results: any[]; type: string }>(`/admin/transactions?type=${type}`);
      if (res.ok) {
        setRows(res.data.results);
      } else {
        onNotify(res.error || 'Failed to load transactions', 'error');
      }
      setLoading(false);
    },
    [onNotify]
  );

  useEffect(() => {
    load(active);
  }, [active, load]);

  const headers = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {types.map((type) => (
          <button
            key={type.id}
            onClick={() => setActive(type.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              active === type.id
                ? 'border-blue-500 bg-blue-500/10 text-blue-200'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5">
        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  {headers.map((key) => (
                    <th key={key} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">
                      {key.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row, idx) => (
                  <tr key={row.id ?? idx}>
                    {headers.map((key) => (
                      <td key={key} className="px-3 py-2 text-xs text-white/80">
                        {String(row[key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-white/60">No records available.</div>
        )}
      </div>
    </div>
  );
}

function StakingPanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [status, setStatus] = useState<'active' | 'matured' | 'cancelled' | 'all'>('active');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [settling, setSettling] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    const res = await apiFetch<{ plans: any[] }>('/admin/staking/plans');
    if (res.ok) setPlans(res.data.plans);
    else onNotify(res.error || 'Failed to load plans', 'error');
    setLoadingPlans(false);
  }, [onNotify]);

  const loadPositions = useCallback(
    async (currentStatus: typeof status) => {
      setLoadingPositions(true);
      const res = await apiFetch<{ positions: any[] }>(`/admin/staking/positions?status=${currentStatus}`);
      if (res.ok) setPositions(res.data.positions);
      else onNotify(res.error || 'Failed to load positions', 'error');
      setLoadingPositions(false);
    },
    [onNotify]
  );

  const settleAll = useCallback(async () => {
    setSettling(true);
    const res = await apiFetch<{ summary: any[] }>('/admin/staking/settle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setSettling(false);
    if (res.ok) {
      const count = res.data.summary?.length || 0;
      onNotify(`تمت تسوية ${count} مركز`, 'success');
      loadPositions(status);
    } else {
      onNotify(res.error || 'فشل تشغيل التسوية', 'error');
    }
  }, [onNotify, status, loadPositions]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    loadPositions(status);
  }, [status, loadPositions]);

  const togglePlanActive = async (plan: any) => {
    const res = await apiFetch(`/admin/staking/plans/${plan.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !plan.is_active }),
    });
    if (res.ok) {
      onNotify('Plan updated', 'success');
      loadPlans();
    } else {
      onNotify(res.error || 'Failed to update plan', 'error');
    }
  };

  const createPlan = async (form: FormData) => {
    const res = await apiFetch('/admin/staking/plans', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        duration_days: Number(form.get('duration_days') || 0),
        apr_bps: Number(form.get('apr_bps') || 0),
        stake_asset: (form.get('stake_asset') as string) || 'ELTX',
        stake_decimals: Number(form.get('stake_decimals') || 18),
        min_deposit: form.get('min_deposit') || undefined,
        is_active: true,
      }),
    });
    if (res.ok) {
      onNotify('Plan created', 'success');
      loadPlans();
    } else {
      onNotify(res.error || 'Plan creation failed', 'error');
    }
  };

  const updatePositionStatus = async (position: any, nextStatus: string) => {
    const res = await apiFetch(`/admin/staking/positions/${position.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      onNotify('Position updated', 'success');
      loadPositions(status);
    } else {
      onNotify(res.error || 'Failed to update position', 'error');
    }
  };

  const settlePosition = async (positionId: number) => {
    setSettling(true);
    const res = await apiFetch(`/admin/staking/settle`, {
      method: 'POST',
      body: JSON.stringify({ positionId }),
    });
    setSettling(false);
    if (res.ok) {
      const count = res.data.summary?.length || 0;
      onNotify(count ? 'تمت تسوية المركز' : 'لا يوجد شيء لتسويته', 'success');
      loadPositions(status);
    } else {
      onNotify(res.error || 'فشل التسوية', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          createPlan(new FormData(e.currentTarget));
          e.currentTarget.reset();
        }}
      >
        <div className="md:col-span-3">
          <h3 className="text-lg font-semibold">Launch new staking plan</h3>
        </div>
        <div>
          <label className="text-xs uppercase text-white/60">Name</label>
          <input name="name" required className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase text-white/60">Duration (days)</label>
          <input name="duration_days" type="number" min={1} required className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase text-white/60">APR (bps)</label>
          <input name="apr_bps" type="number" min={0} required className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase text-white/60">Stake asset</label>
          <input name="stake_asset" defaultValue="ELTX" className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase text-white/60">Asset decimals</label>
          <input name="stake_decimals" type="number" min={0} max={36} defaultValue={18} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase text-white/60">Minimum deposit</label>
          <input name="min_deposit" placeholder="Optional" className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="md:col-span-3">
          <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500">
            <Layers className="h-4 w-4" /> Create plan
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-lg font-semibold">Plan catalogue</h3>
          <button
            onClick={loadPlans}
            className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {loadingPlans ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Plan</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">APR</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Min</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-white">{plan.name}</div>
                      <div className="text-xs text-white/60">{plan.duration_days} days</div>
                    </td>
                    <td className="px-3 py-2">{plan.apr_bps / 100}%</td>
                    <td className="px-3 py-2">{plan.min_deposit ?? '—'}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => togglePlanActive(plan)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          plan.is_active ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
                        } hover:opacity-80`}
                      >
                        {plan.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-lg font-semibold">Positions</h3>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/70 focus:border-blue-500 focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="matured">Matured</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
            <button
              onClick={settleAll}
              disabled={settling}
              className="flex items-center gap-2 rounded-full border border-emerald-200/40 px-3 py-1 text-xs text-emerald-100 transition hover:border-emerald-200 hover:text-white disabled:opacity-60"
            >
              {settling ? 'Running…' : 'Settle now'}
            </button>
            <button
              onClick={() => loadPositions(status)}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>
        {loadingPositions ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">User</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Plan</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Amount</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Daily</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Accrued</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Ends</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Principal</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {positions.map((position) => {
                  const needsPayout =
                    position.status !== 'cancelled' && !position.principal_redeemed &&
                    new Date(position.end_date).getTime() <= Date.now();
                  return (
                    <tr key={position.id}>
                      <td className="px-3 py-2">#{position.user_id}</td>
                      <td className="px-3 py-2">{position.plan_name}</td>
                      <td className="px-3 py-2">{position.amount}</td>
                      <td className="px-3 py-2">{position.daily_reward}</td>
                      <td className="px-3 py-2">{position.accrued_total}</td>
                      <td className="px-3 py-2">{position.end_date?.slice(0, 10)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            position.principal_redeemed ? 'bg-emerald-500/10 text-emerald-200' : 'bg-white/10 text-white/70'
                          }`}
                        >
                          {position.principal_redeemed ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2 py-1 text-xs uppercase text-white/70">{position.status}</span>
                          {position.status === 'active' && (
                            <button
                              onClick={() => updatePositionStatus(position, 'cancelled')}
                              className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-white/60 transition hover:border-red-400 hover:text-red-200"
                            >
                              Force cancel
                            </button>
                          )}
                          {needsPayout && (
                            <button
                              onClick={() => settlePosition(position.id)}
                              className="rounded-full border border-emerald-300/30 px-2 py-1 text-[10px] uppercase text-emerald-100 transition hover:border-emerald-300 hover:text-white"
                              disabled={settling}
                            >
                              {settling ? 'Processing…' : 'Settle'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FeesPanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<FeeSettings>({ swap_fee_bps: 0, spot_trade_fee_bps: 0 });
  const [balances, setBalances] = useState<FeeBalanceRow[]>([]);
  const [form, setForm] = useState({ swap: '0.50', spot: '0.50' });

  const syncFormWithSettings = useCallback((next: FeeSettings) => {
    setForm({
      swap: (next.swap_fee_bps / 100).toFixed(2),
      spot: (next.spot_trade_fee_bps / 100).toFixed(2),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ settings: FeeSettings; balances: FeeBalanceRow[] }>('/admin/fees');
    if (res.ok) {
      setSettings(res.data.settings);
      setBalances(Array.isArray(res.data.balances) ? res.data.balances : []);
      syncFormWithSettings(res.data.settings);
    } else {
      onNotify(res.error || 'Failed to load fee settings', 'error');
    }
    setLoading(false);
  }, [onNotify, syncFormWithSettings]);

  useEffect(() => {
    load();
  }, [load]);

  const parsePercentToBps = (value: string) => {
    const normalized = value.trim();
    if (!normalized.length) return null;
    const num = Number(normalized);
    if (!Number.isFinite(num) || num < 0 || num > 100) return null;
    return Math.round(num * 100);
  };

  const groupedBalances = useMemo(() => {
    return balances.reduce(
      (acc, row) => {
        const key = row.fee_type === 'swap' ? 'swap' : 'spot';
        acc[key].push(row);
        return acc;
      },
      { swap: [] as FeeBalanceRow[], spot: [] as FeeBalanceRow[] }
    );
  }, [balances]);

  const updateFees = async () => {
    const payload: Record<string, unknown> = {};
    const swapBps = parsePercentToBps(form.swap);
    const spotBps = parsePercentToBps(form.spot);

    if (swapBps === null || spotBps === null) {
      onNotify('Enter valid percentage values between 0 and 100', 'error');
      return;
    }

    if (swapBps !== settings.swap_fee_bps) payload.swap_fee_bps = swapBps;
    if (spotBps !== settings.spot_trade_fee_bps) payload.spot_trade_fee_bps = spotBps;
    if (!Object.keys(payload).length) {
      onNotify('No fee changes to save');
      return;
    }

    setSaving(true);
    const res = await apiFetch<{ settings: FeeSettings; balances: FeeBalanceRow[] }>('/admin/fees', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (res.ok) {
      setSettings(res.data.settings);
      setBalances(Array.isArray(res.data.balances) ? res.data.balances : []);
      syncFormWithSettings(res.data.settings);
      onNotify('Fee settings updated', 'success');
    } else {
      onNotify(res.error || 'Failed to update fee settings', 'error');
    }
  };

  const renderBalanceTable = (label: string, rows: FeeBalanceRow[]) => {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-semibold uppercase text-white/60">
          <span>{label}</span>
          <span className="text-[11px] text-white/50">{rows.length ? `${rows.length} assets` : 'No entries yet'}</span>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Asset</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Entries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <tr key={`${row.fee_type}-${row.asset}`}>
                    <td className="px-3 py-2">{row.asset}</td>
                    <td className="px-3 py-2">{row.amount}</td>
                    <td className="px-3 py-2">{row.entries.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-sm text-white/60">No commissions have been collected yet.</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Platform commissions</h3>
          <p className="text-sm text-white/60">Control swap and spot maker/taker fees and audit collected balances.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard
              title="Swap commission"
              value={`${(settings.swap_fee_bps / 100).toFixed(2)}%`}
              subtitle="Applied to every swap execution"
              icon={Coins}
            />
            <StatCard
              title="Spot maker & taker"
              value={`${(settings.spot_trade_fee_bps / 100).toFixed(2)}%`}
              subtitle="Flat fee for both sides of each trade"
              icon={DollarSign}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h4 className="text-md font-semibold">Update fees</h4>
            <p className="mt-1 text-sm text-white/60">Values are percentages; 0.50% equals 50 bps.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase text-white/60">Swap fee (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.swap}
                  onChange={(e) => setForm((prev) => ({ ...prev, swap: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-white/60">Spot maker/taker fee (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.spot}
                  onChange={(e) => setForm((prev) => ({ ...prev, spot: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={updateFees}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" /> {saving ? 'Saving…' : 'Save fees'}
              </button>
              <button
                onClick={() => syncFormWithSettings(settings)}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" /> Reset to current
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {renderBalanceTable('Swap fees collected', groupedBalances.swap)}
            {renderBalanceTable('Spot fees collected', groupedBalances.spot)}
          </div>
        </div>
      )}
    </div>
  );
}

function PricingPanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [swap, setSwap] = useState<SwapPricingRow[]>([]);
  const [spot, setSpot] = useState<SpotMarketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ swap: SwapPricingRow[]; spot: SpotMarketRow[] }>('/admin/pricing');
    if (res.ok) {
      setSwap(Array.isArray(res.data.swap) ? res.data.swap : []);
      setSpot(Array.isArray(res.data.spot) ? res.data.spot : []);
    } else {
      onNotify(res.error || 'Failed to load pricing', 'error');
    }
    setLoading(false);
  }, [onNotify]);

  useEffect(() => {
    load();
  }, [load]);

  const editSwap = async (row: SwapPricingRow) => {
    const price = window.prompt(`Set new ELTX price for ${row.asset} (leave blank to skip)`, row.price_eltx ?? '');
    const min = window.prompt('Set new minimum swap size', row.min_amount ?? '');
    const max = window.prompt('Set new maximum swap size (blank to clear)', row.max_amount ?? '');
    const spread = window.prompt('Spread (bps)', row.spread_bps?.toString() ?? '');
    const body: Record<string, unknown> = {};
    if (price !== null && price !== '') body.price_eltx = price;
    if (min !== null && min !== '') body.min_amount = min;
    if (max !== null) body.max_amount = max.length ? max : null;
    if (spread !== null && spread !== '') {
      const parsed = Number(spread);
      if (!Number.isFinite(parsed)) return onNotify('Invalid spread value', 'error');
      body.spread_bps = parsed;
    }
    if (!Object.keys(body).length) return;
    const res = await apiFetch(`/admin/pricing/swap/${row.asset}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onNotify('Swap pricing updated', 'success');
      load();
    } else {
      onNotify(res.error || 'Failed to update pricing', 'error');
    }
  };

  const editSwapPool = async (row: SwapPricingRow) => {
    const assetDecimals = Number(row.asset_decimals || 18);
    const currentAssetReserve = formatReserve(row.asset_reserve_wei, assetDecimals);
    const currentEltxReserve = formatReserve(row.eltx_reserve_wei, 18);
    const assetReserve = window.prompt(`Update ${row.asset} reserve`, currentAssetReserve);
    const eltxReserve = window.prompt('Update ELTX reserve', currentEltxReserve);
    const body: Record<string, unknown> = {};

    if (assetReserve !== null && assetReserve !== '') {
      const wei = toWeiString(assetReserve, assetDecimals);
      if (wei === null) return onNotify('Invalid asset reserve value', 'error');
      body.asset_reserve_wei = wei;
    }

    if (eltxReserve !== null && eltxReserve !== '') {
      const wei = toWeiString(eltxReserve, 18);
      if (wei === null) return onNotify('Invalid ELTX reserve value', 'error');
      body.eltx_reserve_wei = wei;
    }

    if (!Object.keys(body).length) return;

    const res = await apiFetch(`/admin/pricing/swap/${row.asset}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onNotify('Pool balances updated', 'success');
      load();
    } else {
      onNotify(res.error || 'Failed to update pool', 'error');
    }
  };

  const editSpot = async (row: SpotMarketRow) => {
    const minBase = window.prompt('Minimum base amount', row.min_base_amount ?? '');
    const minQuote = window.prompt('Minimum quote amount', row.min_quote_amount ?? '');
    const pricePrecision = window.prompt('Price precision (0-18)', row.price_precision?.toString() ?? '');
    const amountPrecision = window.prompt('Amount precision (0-18)', row.amount_precision?.toString() ?? '');
    const activeInput = window.prompt('Market status (active/inactive)', row.active ? 'active' : 'inactive');
    const body: Record<string, unknown> = {};

    if (minBase !== null && minBase.trim() !== '') body.min_base_amount = minBase.trim();
    if (minQuote !== null && minQuote.trim() !== '') body.min_quote_amount = minQuote.trim();

    if (pricePrecision !== null && pricePrecision.trim() !== '') {
      const parsed = Number(pricePrecision);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 18) return onNotify('Invalid price precision', 'error');
      body.price_precision = parsed;
    }

    if (amountPrecision !== null && amountPrecision.trim() !== '') {
      const parsed = Number(amountPrecision);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 18) return onNotify('Invalid amount precision', 'error');
      body.amount_precision = parsed;
    }

    if (activeInput !== null && activeInput.trim() !== '') {
      const normalized = activeInput.trim().toLowerCase();
      if (['active', 'yes', 'true', 'y', '1'].includes(normalized)) body.active = true;
      else if (['inactive', 'no', 'false', 'n', '0', 'off'].includes(normalized)) body.active = false;
      else return onNotify('Invalid market status', 'error');
    }

    if (!Object.keys(body).length) return;

    const res = await apiFetch(`/admin/pricing/spot/${row.symbol}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onNotify('Spot market updated', 'success');
      load();
    } else {
      onNotify(res.error || 'Update failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Swap & spot pricing</h3>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold uppercase text-white/60">Swap assets</div>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Asset</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Price</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Min</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Max</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Spread</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Pool</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {swap.map((row) => (
                    <tr key={row.asset}>
                      <td className="px-3 py-2">{row.asset}</td>
                      <td className="px-3 py-2">{row.price_eltx}</td>
                      <td className="px-3 py-2">{row.min_amount}</td>
                      <td className="px-3 py-2">{row.max_amount ?? '—'}</td>
                      <td className="px-3 py-2">{row.spread_bps} bps</td>
                      <td className="px-3 py-2 text-xs text-white/70">
                        <div className="flex flex-col">
                          <span>
                            {formatReserve(row.asset_reserve_wei, Number(row.asset_decimals || 18))} {row.asset}
                          </span>
                          <span>{formatReserve(row.eltx_reserve_wei, 18)} ELTX</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => editSwap(row)}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                          >
                            Edit pricing
                          </button>
                          <button
                            onClick={() => editSwapPool(row)}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                          >
                            Edit pool
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold uppercase text-white/60">Spot markets</div>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Market</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Base min</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Quote min</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Price precision</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Amount precision</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {spot.map((row) => (
                    <tr key={row.symbol}>
                      <td className="px-3 py-2">{row.symbol}</td>
                      <td className="px-3 py-2">{row.min_base_amount}</td>
                      <td className="px-3 py-2">{row.min_quote_amount}</td>
                      <td className="px-3 py-2">{row.price_precision}</td>
                      <td className="px-3 py-2">{row.amount_precision}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                            row.active ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
                          }`}
                        >
                          {row.active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => editSpot(row)}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StripePanel({ onNotify }: { onNotify: (message: string, variant?: 'success' | 'error') => void }) {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
  const [status, setStatus] = useState<StripeStatusResponse['status'] | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    const res = await apiFetch<{ purchases: any[] }>('/admin/fiat/purchases');
    if (res.ok) setPurchases(res.data.purchases);
    else onNotify(res.error || 'Failed to load purchases', 'error');
    setLoadingPurchases(false);
  }, [onNotify]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    const res = await apiFetch<StripeStatusResponse>('/admin/stripe/status');
    if (res.ok) setStatus(res.data.status);
    else onNotify(res.error || 'Failed to load Stripe status', 'error');
    setStatusLoading(false);
  }, [onNotify]);

  useEffect(() => {
    loadPurchases();
    loadStatus();
  }, [loadPurchases, loadStatus]);

  const refreshAll = useCallback(() => {
    loadStatus();
    loadPurchases();
  }, [loadPurchases, loadStatus]);

  const envRows = [
    { label: 'STRIPE_PUBLISHABLE_KEY', value: status?.publishableKey || 'Not set' },
    { label: 'STRIPE_SECRET_KEY', value: status?.secretKey || 'Not set' },
    { label: 'STRIPE_WEBHOOK_SECRET', value: status?.webhookSecret || 'Not set' },
    { label: 'RETURN URL BASE', value: status?.returnUrlBase || 'Not set' },
    { label: 'SUCCESS URL', value: status?.successUrl || 'Not set' },
    { label: 'CANCEL URL', value: status?.cancelUrl || 'Not set' },
    {
      label: 'LIMITS (USD)',
      value: `${status?.minPurchaseUsd ?? '—'} - ${status?.maxPurchaseUsd ?? '∞'}`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Stripe conversions</h3>
        <button
          onClick={refreshAll}
          className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold uppercase text-white/60">
          Environment status
        </div>
        {statusLoading ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : status ? (
          <div className="space-y-4 p-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-base font-semibold">
                <span className={`h-2 w-2 rounded-full ${status.enabled ? 'bg-green-400' : 'bg-red-400'}`}></span>
                {status.enabled ? 'Checkout enabled' : 'Checkout disabled'}
              </div>
              <div className="text-xs text-white/60">
                {status.sdkReady ? 'Stripe SDK initialized' : 'Stripe SDK not initialized'}
              </div>
              {!status.enabled && status.reason && (
                <div className="text-xs text-red-300">{status.reason}</div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {envRows.map((row) => (
                <div key={row.label} className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">{row.label}</div>
                  <div className="mt-1 font-mono text-xs text-white/80 break-all">{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 text-sm text-white/70">Unable to read Stripe status.</div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        {loadingPurchases ? (
          <div className="flex h-60 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">User</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">USD</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">ELTX</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-white/60">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {purchases.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">#{row.user_id}</td>
                    <td className="px-3 py-2">${row.usd_amount}</td>
                    <td className="px-3 py-2">{row.eltx_amount}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs uppercase text-white/70">{row.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-white/60">{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const toast = useToast();
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);
  const [active, setActive] = useState<Section>('overview');
  const [authLoading, setAuthLoading] = useState(false);

  const notify = useCallback(
    (message: string, variant: 'success' | 'error' = 'success') => {
      toast({ message, variant: variant === 'success' ? 'success' : 'error' });
    },
    [toast]
  );

  const loadMe = useCallback(async () => {
    const res = await apiFetch<{ ok: boolean; admin: Admin }>('/admin/auth/me');
    if (res.ok) {
      setAdmin(res.data.admin);
    } else {
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const handleLogin = async (identifier: string, password: string) => {
    setAuthLoading(true);
    const res = await apiFetch<{ ok: boolean; admin: Admin }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setAuthLoading(false);
    if (res.ok) {
      setAdmin(res.data.admin);
      notify('Authenticated');
    } else {
      notify(res.error || 'Invalid credentials', 'error');
    }
  };

  const handleLogout = async () => {
    await apiFetch('/admin/auth/logout', { method: 'POST' });
    setAdmin(null);
  };

  if (admin === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!admin) {
    return <LoginForm onSubmit={handleLogin} loading={authLoading} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/50">ELTX Command Center</p>
            <h1 className="text-2xl font-semibold">Welcome back, {admin.username}</h1>
            <p className="text-xs text-white/50">Role: {admin.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadMe}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" /> Sync session
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-200 transition hover:border-red-400"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <SectionTabs active={active} onSelect={setActive} />
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-xl shadow-blue-900/20 backdrop-blur">
          {active === 'overview' && <OverviewPanel onError={(msg) => notify(msg, 'error')} />}
          {active === 'admins' && <AdminUsersPanel admin={admin} onNotify={notify} />}
          {active === 'users' && <UsersPanel onNotify={notify} />}
          {active === 'transactions' && <TransactionsPanel onNotify={notify} />}
          {active === 'staking' && <StakingPanel onNotify={notify} />}
          {active === 'fees' && <FeesPanel onNotify={notify} />}
          {active === 'ai' && <AiPanel onNotify={notify} />}
          {active === 'pricing' && <PricingPanel onNotify={notify} />}
          {active === 'stripe' && <StripePanel onNotify={notify} />}
        </div>
      </main>
    </div>
  );
}
