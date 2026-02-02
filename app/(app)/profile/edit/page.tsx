'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { dict, useLang } from '../../../lib/i18n';
import { useToast } from '../../../lib/toast';
import { getProfile, saveProfile, updatePostsForProfile, type SocialProfile } from '../../../lib/social-store';

export default function EditProfilePage() {
  const { lang } = useLang();
  const t = dict[lang];
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<SocialProfile | null>(null);

  useEffect(() => {
    const current = getProfile();
    setProfile(current);
  }, []);

  if (!profile) {
    return null;
  }

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
              if (!profile) return;
              updatePostsForProfile(profile.profileId, {
                authorName: profile.publicName,
                handle: profile.handle,
                avatarUrl: profile.avatarUrl,
              });
              saveProfile(profile);
              toast(t.dashboard.social.profileUpdated);
              router.push('/profile');
            }}
          >
            {t.common.save || 'Save'}
          </button>
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
            onClick={() => router.back()}
          >
            {t.common.back}
          </button>
        </div>
      </div>
    </div>
  );
}
