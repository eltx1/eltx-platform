'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Download, Loader2, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

interface KycRequest {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  full_name: string;
  country: string;
  document_type: string;
  document_number: string;
  document_filename?: string | null;
  rejection_reason?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface KycState {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  request: KycRequest | null;
  can_resubmit: boolean;
}

interface FilePayload {
  base64: string;
  name: string;
  type: string;
}

export default function KycPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  const [state, setState] = useState<KycState>({ status: 'none', request: null, can_resubmit: true });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filePayload, setFilePayload] = useState<FilePayload | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    country: '',
    documentType: '',
    documentNumber: '',
    agreement: false,
  });

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<KycState>('/kyc/me');
    if (res.ok) {
      setState(res.data);
      if (res.data.request) {
        setForm((prev) => ({
          ...prev,
          fullName: res.data.request?.full_name || prev.fullName,
          country: res.data.request?.country || prev.country,
          documentType: res.data.request?.document_type || prev.documentType,
          documentNumber: res.data.request?.document_number || prev.documentNumber,
        }));
      }
    } else {
      toast({ message: t.kyc.toast.loadError, variant: 'error' });
    }
    setLoading(false);
  }, [t.kyc.toast.loadError, toast]);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) router.replace('/login');
    else loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, loadStatus]);

  const statusChip = useMemo(() => {
    const base = 'px-2 py-1 rounded-full text-xs font-semibold';
    if (state.status === 'approved') return `${base} bg-emerald-500/20 text-emerald-200`;
    if (state.status === 'pending') return `${base} bg-amber-500/20 text-amber-100`;
    if (state.status === 'rejected') return `${base} bg-red-500/20 text-red-200`;
    return `${base} bg-white/10 text-white/70`;
  }, [state.status]);

  const humanStatus = t.kyc.statuses[state.status] || state.status;

  const canSubmit = useMemo(() => {
    if (submitting || loading) return false;
    if (!state.can_resubmit && state.status !== 'none') return false;
    if (state.status === 'approved') return false;
    if (state.status === 'pending') return false;
    return true;
  }, [loading, state.can_resubmit, state.status, submitting]);

  const handleFileChange = (file?: File | null) => {
    if (!file) return setFilePayload(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string) || '';
      setFilePayload({ base64: base64.split(',').pop() || '', name: file.name, type: file.type || 'application/octet-stream' });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (!filePayload) {
      toast({ message: t.kyc.documentNote, variant: 'error' });
      return;
    }
    setSubmitting(true);
    const res = await apiFetch<KycState>('/kyc/submit', {
      method: 'POST',
      body: JSON.stringify({
        full_name: form.fullName,
        country: form.country,
        document_type: form.documentType,
        document_number: form.documentNumber,
        agreement: form.agreement,
        document_file: filePayload,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ message: t.kyc.toast.submitted, variant: 'success' });
      setState(res.data);
      setFilePayload(null);
    } else {
      toast({ message: res.error || t.kyc.toast.error, variant: 'error' });
    }
  };

  const statusMessage = useMemo(() => {
    if (state.status === 'approved') return t.kyc.approvedMessage;
    if (state.status === 'pending') return t.kyc.pendingMessage;
    if (state.status === 'rejected') return t.kyc.rejectedMessage;
    return t.kyc.description;
  }, [state.status, t.kyc]);

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> {t.kyc.title}
        </h1>
        <p className="text-white/70 text-sm">{t.kyc.description}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs uppercase text-white/60">{t.kyc.statusLabel}</div>
            <div className="flex items-center gap-2">
              <span className={statusChip}>{humanStatus}</span>
              {state.request?.updated_at && (
                <span className="text-xs text-white/60">
                  {t.kyc.lastUpdated}: {new Date(state.request.updated_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            {state.status === 'approved' && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
            {state.status === 'pending' && <Loader2 className="h-5 w-5 animate-spin text-amber-300" />}
            {state.status === 'rejected' && <XCircle className="h-5 w-5 text-red-300" />}
            <span>{statusMessage}</span>
          </div>
        </div>
        {state.request?.rejection_reason && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <div className="font-semibold">{t.kyc.rejectionReason}</div>
              <p className="text-red-50/80">{state.request.rejection_reason}</p>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium">{t.kyc.fields.fullName}</label>
          <input
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            disabled={!canSubmit || loading}
            className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t.kyc.fields.country}</label>
            <input
              value={form.country}
              onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              disabled={!canSubmit || loading}
              className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t.kyc.fields.documentType}</label>
            <input
              value={form.documentType}
              onChange={(e) => setForm((prev) => ({ ...prev, documentType: e.target.value }))}
              disabled={!canSubmit || loading}
              className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
              required
              placeholder="Passport / National ID / Driver License"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t.kyc.fields.documentNumber}</label>
          <input
            value={form.documentNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, documentNumber: e.target.value }))}
            disabled={!canSubmit || loading}
            className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t.kyc.document}</div>
              <p className="text-xs text-white/60">{t.kyc.documentNote}</p>
            </div>
            {state.request?.document_filename && (
              <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
                <Download className="h-3 w-3" />
                <span>
                  {t.kyc.viewFile}: {state.request.document_filename}
                </span>
              </div>
            )}
          </div>
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm transition ${
              canSubmit && !loading
                ? 'border-white/20 bg-black/20 hover:border-blue-400 hover:bg-black/30'
                : 'border-white/10 bg-black/30 opacity-60'
            }`}
          >
            <UploadCloud className="h-6 w-6" />
            <span>{filePayload ? filePayload.name : t.kyc.helper}</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={!canSubmit || loading}
              onChange={(e) => handleFileChange(e.target.files?.[0])}
              required={!state.request || state.status === 'rejected'}
            />
          </label>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.agreement}
            onChange={(e) => setForm((prev) => ({ ...prev, agreement: e.target.checked }))}
            disabled={!canSubmit || loading}
            required
            className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
          />
          <span className="text-white/80">{t.kyc.agreement}</span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {state.status === 'rejected' ? t.kyc.resubmit : t.kyc.submit}
          </button>
          {!canSubmit && state.status === 'pending' && (
            <span className="text-xs text-white/60">{t.kyc.pendingMessage}</span>
          )}
        </div>
      </form>
    </div>
  );
}
