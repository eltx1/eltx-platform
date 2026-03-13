'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { useAuth } from '../../../lib/auth';
import { createPost, getPostWordLimit, getProfile, savePost, validatePostImage } from '../../../lib/social-store';

export default function NewPostPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [wordLimit, setWordLimit] = useState(1000);

  useEffect(() => {
    setWordLimit(getPostWordLimit());
  }, []);

  const wordCount = useMemo(() => {
    if (!content.trim()) return 0;
    return content.trim().split(/\s+/).length;
  }, [content]);

  const handleImage = (file?: File | null) => {
    if (!file) {
      setImageFile(null);
      setImagePreviewUrl(null);
      return;
    }

    const validation = validatePostImage(file);
    if (!validation.ok) {
      toast(t.dashboard.social.imageTooLarge);
      return;
    }

    setImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);
  };

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  async function uploadPostImage(file: File) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/api/social/uploads', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) return { ok: false as const, url: null };
    const payload = await response.json() as { imageUrl?: string };
    return { ok: Boolean(payload?.imageUrl), url: payload?.imageUrl || null };
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-3xl">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.quickPostKicker}</p>
        <h1 className="text-lg font-semibold sm:text-xl">{t.dashboard.social.newPostCta}</h1>
        <p className="text-sm text-white/60">
          {wordCount}/{wordLimit} {t.dashboard.social.words}
        </p>
      </div>

      <textarea
        className="w-full min-h-[180px] rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
        placeholder={t.dashboard.social.quickPostPlaceholder}
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <label className="text-sm text-white/70">{t.dashboard.social.quickPostHint}</label>
        <input
          type="file"
          accept="image/*"
          className="block w-full text-xs text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-xs file:text-white hover:file:bg-white/20"
          onChange={(event) => handleImage(event.target.files?.[0])}
        />
        {imagePreviewUrl && (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <Image src={imagePreviewUrl} alt="Post preview" width={960} height={540} className="h-auto w-full object-cover" unoptimized />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn btn-primary px-4 py-2 text-xs"
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
            let uploadedImageUrl: string | null = null;
            if (imageFile) {
              const uploadResult = await uploadPostImage(imageFile);
              if (!uploadResult.ok || !uploadResult.url) {
                toast(t.dashboard.social.quickPostStorageError);
                return;
              }
              uploadedImageUrl = uploadResult.url;
            }
            const profile = getProfile(user.id, user);
            const newPost = createPost({ content: content.trim(), imageUrl: uploadedImageUrl, profile });
            const saveResult = await savePost(newPost, user.id);
            if (!saveResult.ok) {
              toast(t.dashboard.social.quickPostStorageError);
              return;
            }
            toast(t.dashboard.social.quickPostSuccess);
            router.push('/profile');
          }}
        >
          {t.dashboard.social.quickPostCta}
        </button>
        <button
          className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
          onClick={() => router.back()}
        >
          {t.common.back}
        </button>
      </div>
    </div>
  );
}
