const { ethers } = require('ethers');

// Base derivation path for all HD wallets in the platform.
// Do NOT change this after generating any user addresses.
const DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0";

function getMasterMnemonic() {
  const mnemonic = (process.env.MASTER_MNEMONIC || '').trim();
  if (!mnemonic) {
    const err = new Error('MASTER_MNEMONIC not set');
    err.code = 'MASTER_MNEMONIC_MISSING';
    throw err;
  }
  if (!ethers.Mnemonic.isValidMnemonic(mnemonic)) {
    const err = new Error('MASTER_MNEMONIC is invalid; replace it with a valid BIP-39 phrase');
    err.code = 'MASTER_MNEMONIC_INVALID';
    throw err;
  }
  return mnemonic;
}

function getMasterNode() {
  const mnemonic = getMasterMnemonic();
  return ethers.HDNodeWallet.fromPhrase(mnemonic);
}

function sanitizeIndex(index) {
  const asNumber = Number(index);
  if (!Number.isInteger(asNumber) || asNumber < 0) {
    const err = new Error('Derivation index must be a non-negative integer');
    err.code = 'INVALID_DERIVATION_INDEX';
    throw err;
  }
  return asNumber;
}

function getDerivationPath(index) {
  const normalizedIndex = sanitizeIndex(index);
  return `${DERIVATION_PATH_PREFIX}/${normalizedIndex}`;
}

function getWalletForIndex(index, provider) {
  const mnemonic = getMasterMnemonic();
  const path = getDerivationPath(index);
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return provider ? wallet.connect(provider) : wallet;
}

function getAddressForIndex(index) {
  return getWalletForIndex(index).address;
}

function getPrivateKeyForIndex(index) {
  return getWalletForIndex(index).privateKey;
}

function getMasterFingerprint() {
  return getMasterNode().fingerprint;
}

let fingerprintLogged = false;
function logMasterFingerprint(context = 'hd-wallet', logger = console) {
  if (fingerprintLogged) return;
  const fingerprint = getMasterFingerprint();
  const mnemonicLength = getMasterMnemonic().length;
  logger.log(
    JSON.stringify({
      tag: 'HD:FINGERPRINT',
      context,
      fingerprint,
      derivation_path: `${DERIVATION_PATH_PREFIX}/<index>`,
      mnemonic_length: mnemonicLength,
    })
  );
  fingerprintLogged = true;
}

module.exports = {
  DERIVATION_PATH_PREFIX,
  getMasterMnemonic,
  getMasterNode,
  getDerivationPath,
  getWalletForIndex,
  getAddressForIndex,
  getPrivateKeyForIndex,
  getMasterFingerprint,
  logMasterFingerprint,
};
