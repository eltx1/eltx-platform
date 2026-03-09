import { promises as fs } from 'fs';
import path from 'path';

export type AdsFilesSettings = {
  adsTxt: string;
  appAdsTxt: string;
  sellersJson: string;
};

const ADS_TXT_PATH = path.join(process.cwd(), 'ads.txt');
const APP_ADS_TXT_PATH = path.join(process.cwd(), 'app-ads.txt');
const SELLERS_JSON_PATH = path.join(process.cwd(), 'sellers.json');

const defaults: AdsFilesSettings = {
  adsTxt: '',
  appAdsTxt: '',
  sellersJson: '',
};

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim();
}

function normalize(input: Partial<AdsFilesSettings> | null | undefined): AdsFilesSettings {
  return {
    adsTxt: normalizeText(input?.adsTxt),
    appAdsTxt: normalizeText(input?.appAdsTxt),
    sellersJson: normalizeText(input?.sellersJson),
  };
}

async function readFileOrDefault(filePath: string): Promise<string> {
  try {
    return normalizeText(await fs.readFile(filePath, 'utf8'));
  } catch {
    return '';
  }
}

async function writeTextFile(filePath: string, content: string) {
  await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf8');
}

export async function readAdsFilesSettings(): Promise<AdsFilesSettings> {
  const [adsTxt, appAdsTxt, sellersJson] = await Promise.all([
    readFileOrDefault(ADS_TXT_PATH),
    readFileOrDefault(APP_ADS_TXT_PATH),
    readFileOrDefault(SELLERS_JSON_PATH),
  ]);

  return {
    ...defaults,
    adsTxt,
    appAdsTxt,
    sellersJson,
  };
}

export async function writeAdsFilesSettings(input: Partial<AdsFilesSettings> | null | undefined): Promise<AdsFilesSettings> {
  const settings = normalize(input);

  await Promise.all([
    writeTextFile(ADS_TXT_PATH, settings.adsTxt),
    writeTextFile(APP_ADS_TXT_PATH, settings.appAdsTxt),
    writeTextFile(SELLERS_JSON_PATH, settings.sellersJson),
  ]);

  return settings;
}
