'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { createPost, getPostWordLimit, getProfile, savePost } from '../../../lib/social-store';

export default function NewPostPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const router = useRouter();
  const toast = useToast();
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
      setImageUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

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
        {imageUrl && (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <Image src={imageUrl} alt="Post preview" width={960} height={540} className="h-auto w-full object-cover" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn btn-primary px-4 py-2 text-xs"
          onClick={() => {
            if (!content.trim()) {
              toast(t.dashboard.social.quickPostEmpty);
              return;
            }
            if (wordCount > wordLimit) {
              toast(t.dashboard.social.quickPostLimit);
              return;
            }
            const profile = getProfile();
            const newPost = createPost({ content: content.trim(), imageUrl, profile });
            savePost(newPost);
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
