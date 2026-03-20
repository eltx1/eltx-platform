'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { useAuth } from '../../../lib/auth';
import { apiFetch } from '../../../lib/api';
import { createPost, getPostWordLimit, getProfile, savePost } from '../../../lib/social-store';
import {
  formatImageSize,
  optimizeImageBeforeUpload,
  validatePostImage,
  type OptimizedSocialImage,
} from '../../../lib/social-image-client';
import {
  DEFAULT_SOCIAL_UPLOAD_SETTINGS,
  formatUploadLimitLabel,
  type SocialUploadSettings,
} from '../../../lib/social-upload-settings';

type UploadResponse = {
  imageUrl?: string;
  error?: string;
  maxImageUploadMb?: number;
};

type SelectedImage = OptimizedSocialImage & {
  previewUrl: string;
  originalFile: File;
};

export default function NewPostPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [content, setContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [wordLimit, setWordLimit] = useState(1000);
  const [uploadSettings, setUploadSettings] = useState<SocialUploadSettings>(DEFAULT_SOCIAL_UPLOAD_SETTINGS);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    setWordLimit(getPostWordLimit());
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ settings?: SocialUploadSettings }>('/api/admin/social-upload-settings').then((res) => {
      if (!mounted || !res.ok || !res.data?.settings) return;
      setUploadSettings(res.data.settings);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const wordCount = useMemo(() => {
    if (!content.trim()) return 0;
    return content.trim().split(/\s+/).length;
  }, [content]);

  const uploadLimitLabel = useMemo(() => formatUploadLimitLabel(uploadSettings.maxImageUploadMb), [uploadSettings.maxImageUploadMb]);

  useEffect(() => () => {
    if (selectedImage?.previewUrl) URL.revokeObjectURL(selectedImage.previewUrl);
  }, [selectedImage]);

  const resetImage = () => {
    setSelectedImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImage = async (file?: File | null) => {
    if (!file) {
      resetImage();
      return;
    }

    setIsOptimizing(true);
    setProgressLabel(t.dashboard.social.imageOptimizePending);
    setUploadProgress(8);

    const optimized = await optimizeImageBeforeUpload(file);
    const validation = validatePostImage(optimized.file, uploadSettings);

    if (!validation.ok) {
      resetImage();
      setProgressLabel('');
      setUploadProgress(0);
      setIsOptimizing(false);
      toast(t.dashboard.social.imageTooLarge(uploadLimitLabel));
      return;
    }

    setSelectedImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        ...optimized,
        originalFile: file,
        previewUrl: URL.createObjectURL(optimized.file),
      };
    });

    setProgressLabel(optimized.wasOptimized ? t.dashboard.social.imageOptimized(formatImageSize(optimized.savedBytes)) : t.dashboard.social.imageReady);
    setUploadProgress(100);
    setIsOptimizing(false);
  };

  async function uploadPostImage(file: File) {
    return new Promise<{ ok: boolean; url: string | null; error?: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('image', file);
      xhr.open('POST', '/api/social/uploads');
      xhr.responseType = 'json';
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      };
      xhr.onload = () => {
        const payload = (xhr.response || {}) as UploadResponse;
        if (xhr.status >= 200 && xhr.status < 300 && payload?.imageUrl) {
          resolve({ ok: true, url: payload.imageUrl });
          return;
        }
        resolve({ ok: false, url: null, error: payload?.error });
      };
      xhr.onerror = () => resolve({ ok: false, url: null, error: 'Upload failed' });
      xhr.send(formData);
    });
  }

  const busy = isOptimizing || isPublishing;
  const progressVisible = busy || uploadProgress > 0 || Boolean(progressLabel);
  const canPublish = Boolean(content.trim()) && !busy && wordCount <= wordLimit;

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-6">
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(217,70,239,0.18),_transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="border-b border-white/10 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80">{t.dashboard.social.quickPostKicker}</p>
              <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">{t.dashboard.social.newPostCta}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/65">{t.dashboard.social.quickPostHint}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[340px]">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-white/45">{t.dashboard.social.words}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{wordCount}<span className="text-sm text-white/45">/{wordLimit}</span></p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-100/70">Media</p>
                <p className="mt-2 text-2xl font-semibold text-white">{uploadLimitLabel}</p>
                <p className="mt-1 text-xs text-white/55">{t.dashboard.social.uploadLimitHint(uploadLimitLabel)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-black/30 p-4 shadow-inner shadow-black/20 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm text-fuchsia-200/80">
                <Sparkles className="h-4 w-4" />
                <span>{t.dashboard.social.quickPostPlaceholder}</span>
              </div>
              <textarea
                className="min-h-[240px] w-full resize-none border-0 bg-transparent text-base text-white placeholder:text-white/35 focus:outline-none"
                placeholder={t.dashboard.social.quickPostPlaceholder}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Media upload</p>
                  <p className="mt-1 text-xs text-white/55">{t.dashboard.social.uploadLimitHint(uploadLimitLabel)}</p>
                </div>
                {selectedImage ? (
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10"
                    onClick={resetImage}
                    disabled={busy}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-200">
                  {isOptimizing ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Drop an image or tap to browse</p>
                  <p className="mt-1 text-xs text-white/50">JPEG, PNG, WEBP, GIF, AVIF</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void handleImage(event.target.files?.[0])}
                  disabled={busy}
                />
              </label>

              {selectedImage ? (
                <div className="mt-4 space-y-4 rounded-[24px] border border-white/10 bg-black/25 p-4">
                  <div className="overflow-hidden rounded-[20px] border border-white/10">
                    <Image src={selectedImage.previewUrl} alt="Post preview" width={1200} height={900} className="h-auto w-full object-cover" unoptimized />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/45">{t.dashboard.social.imageOriginalSize}</p>
                      <p className="mt-2 font-medium text-white">{formatImageSize(selectedImage.originalSize)}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-white/75">
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/75">{t.dashboard.social.imageUploadSize}</p>
                      <p className="mt-2 font-medium text-white">{formatImageSize(selectedImage.optimizedSize)}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Wand2 className="h-4 w-4 text-fuchsia-200" />
                Publish flow
              </div>
              <ul className="mt-4 space-y-3 text-sm text-white/65">
                <li className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />Client-side image preparation before upload.</li>
                <li className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />Visible progress during image transfer and post publishing.</li>
                <li className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />Single-click protection prevents duplicate publish requests.</li>
              </ul>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                {busy ? <Loader2 className="h-4 w-4 animate-spin text-fuchsia-200" /> : <AlertCircle className="h-4 w-4 text-amber-200" />}
                <span>{busy ? t.dashboard.social.publishBusy : 'Ready to publish'}</span>
              </div>

              {progressVisible ? (
                <div className="mt-4 space-y-3">
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-400 to-emerald-400 transition-all duration-300"
                      style={{ width: `${Math.max(uploadProgress, busy ? 8 : 0)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/55">
                    <span>{progressLabel || t.dashboard.social.publishProgressHint}</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-white/50">{t.dashboard.social.publishProgressHint}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="btn btn-primary min-w-[150px] px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={async () => {
                  if (!content.trim()) {
                    toast(t.dashboard.social.quickPostEmpty);
                    return;
                  }
                  if (wordCount > wordLimit) {
                    toast(t.dashboard.social.quickPostLimit);
                    return;
                  }
                  if (!user?.id) {
                    toast(t.dashboard.social.sessionMissing);
                    return;
                  }

                  setIsPublishing(true);
                  setUploadProgress(selectedImage ? 0 : 65);
                  setProgressLabel(selectedImage ? t.dashboard.social.imageUploadProgress : t.dashboard.social.publishProgress);

                  let uploadedImageUrl: string | null = null;
                  if (selectedImage) {
                    const uploadResult = await uploadPostImage(selectedImage.file);
                    if (!uploadResult.ok || !uploadResult.url) {
                      setIsPublishing(false);
                      setUploadProgress(0);
                      setProgressLabel('');
                      toast(uploadResult.error || t.dashboard.social.quickPostStorageError);
                      return;
                    }
                    uploadedImageUrl = uploadResult.url;
                  }

                  setProgressLabel(t.dashboard.social.publishProgress);
                  setUploadProgress(92);

                  const profile = getProfile(user.id, user);
                  const newPost = createPost({ content: content.trim(), imageUrl: uploadedImageUrl, profile });
                  const saveResult = await savePost(newPost, user.id);
                  if (!saveResult.ok) {
                    setIsPublishing(false);
                    setUploadProgress(0);
                    setProgressLabel('');
                    toast(t.dashboard.social.quickPostStorageError);
                    return;
                  }

                  setUploadProgress(100);
                  setProgressLabel(t.dashboard.social.quickPostSuccess);
                  toast(t.dashboard.social.quickPostSuccess);
                  setTimeout(() => {
                    router.push('/profile');
                  }, 250);
                }}
                disabled={!canPublish}
              >
                {busy ? t.dashboard.social.publishBusy : t.dashboard.social.quickPostCta}
              </button>
              <button
                className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 disabled:opacity-60"
                onClick={() => router.back()}
                disabled={busy}
              >
                {t.common.back}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
