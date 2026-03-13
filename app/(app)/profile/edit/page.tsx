'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { fetchProfile, getProfile, isValidAvatarUrl, saveProfileRemote, type SocialProfile } from '../../../lib/social-store';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

export default function EditProfilePage() {
  const { lang } = useLang();
  const t = dict[lang];
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [profile, setProfile] = useState<SocialProfile | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    setProfile(getProfile(user.id, user));
    fetchProfile(user.id, user).then((result) => {
      if (!cancelled) setProfile(result.profile);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user]);

  const handleAvatarUpload = async (file?: File | null) => {
    if (!file || !profile) return;
    if (!file.type.startsWith('image/')) {
      toast(t.dashboard.social.profileAvatarInvalid);
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast(t.dashboard.social.avatarTooLarge);
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    const res = await apiFetch<{ imageUrl: string }>('/api/social/uploads', {
      method: 'POST',
      body: formData,
      headers: {},
    });

    if (!res.ok || !res.data?.imageUrl) {
      toast(t.dashboard.social.quickPostStorageError);
      return;
    }

    const nextProfile = { ...profile, avatarUrl: res.data.imageUrl };
    setProfile(nextProfile);
    const persistResult = await saveProfileRemote(nextProfile, user?.id);
    if (!persistResult.ok) {
      toast(t.dashboard.social.quickPostStorageError);
      return;
    }
    toast(t.dashboard.social.avatarUploaded);
  };

  if (!profile) return null;

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-3xl">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.profileTitle}</p>
        <h1 className="text-lg font-semibold sm:text-xl">{t.dashboard.cards.editProfile.title}</h1>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden border border-white/10 bg-white/10">
            <Image src={profile.avatarUrl} alt={profile.publicName} width={64} height={64} className="h-full w-full object-cover" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-white/60">{t.dashboard.social.profileTitle}</p>
            <p className="text-base font-semibold">{profile.publicName}</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-black/20 px-4 py-3 text-xs text-white/80 hover:bg-black/35">
          <Upload className="h-4 w-4" />
          {t.dashboard.social.uploadAvatarCta}
          <input type="file" accept="image/*" className="hidden" onChange={(event) => {
              void handleAvatarUpload(event.target.files?.[0]);
            }} />
        </label>

        <div className="space-y-2">
          <label className="text-sm text-white/70">{t.dashboard.social.profilePublicName}</label>
          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            value={profile.publicName}
            onChange={(event) => setProfile({ ...profile, publicName: event.target.value })}
            placeholder={t.dashboard.social.profilePublicNamePlaceholder}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/70">{t.dashboard.social.profileHandle}</label>
          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            value={profile.handle}
            onChange={(event) => setProfile({ ...profile, handle: event.target.value })}
            placeholder={t.dashboard.social.profileHandlePlaceholder}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/70">{t.dashboard.social.profileAvatar}</label>
          <input
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            value={profile.avatarUrl}
            onChange={(event) => setProfile({ ...profile, avatarUrl: event.target.value })}
            placeholder={t.dashboard.social.profileAvatarPlaceholder}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/70">{t.dashboard.social.profileBio}</label>
          <textarea
            className="w-full min-h-[120px] rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            value={profile.bio}
            onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
            placeholder={t.dashboard.social.profileBioPlaceholder}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="btn btn-primary px-4 py-2 text-xs"
            onClick={() => {
              if (!user?.id) return toast(t.dashboard.social.sessionMissing);
              if (!isValidAvatarUrl(profile.avatarUrl)) return toast(t.dashboard.social.profileAvatarInvalid);
              void (async () => {
                const saveResult = await saveProfileRemote(profile, user.id);
                if (!saveResult.ok) return toast(t.dashboard.social.quickPostStorageError);
                toast(t.dashboard.social.profileUpdated);
                router.push('/profile');
              })();
            }}
          >
            {t.common.save || 'Save'}
          </button>
          <button className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10" onClick={() => router.back()}>
            {t.common.back}
          </button>
        </div>
      </div>
    </div>
  );
}
