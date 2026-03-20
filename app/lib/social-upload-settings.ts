export type SocialUploadSettings = {
  maxImageUploadMb: number;
};

export const DEFAULT_SOCIAL_UPLOAD_SETTINGS: SocialUploadSettings = {
  maxImageUploadMb: 15,
};

export const SOCIAL_UPLOAD_DB_SETTING_NAME = 'social_upload_settings_json';
export const SOCIAL_UPLOAD_FILE_PATH = 'data/social-upload-settings.json';

export function normalizeSocialUploadSettings(input: Partial<SocialUploadSettings> | null | undefined): SocialUploadSettings {
  const rawMaxMb = Number(input?.maxImageUploadMb ?? DEFAULT_SOCIAL_UPLOAD_SETTINGS.maxImageUploadMb);
  const maxImageUploadMb = Number.isFinite(rawMaxMb) ? Math.min(50, Math.max(1, Math.round(rawMaxMb))) : DEFAULT_SOCIAL_UPLOAD_SETTINGS.maxImageUploadMb;

  return {
    maxImageUploadMb,
  };
}

export function getSocialUploadLimitBytes(settings: Partial<SocialUploadSettings> | null | undefined) {
  return normalizeSocialUploadSettings(settings).maxImageUploadMb * 1024 * 1024;
}

export function formatUploadLimitLabel(limitMb: number) {
  const normalized = Number(limitMb);
  if (!Number.isFinite(normalized)) return `${DEFAULT_SOCIAL_UPLOAD_SETTINGS.maxImageUploadMb} MB`;
  return `${normalized} MB`;
}
