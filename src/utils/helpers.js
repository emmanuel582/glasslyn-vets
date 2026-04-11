// ============================================
// Glasslyn Vets — Helper Utilities
// ============================================

/**
 * Normalise a phone number to digits-only format for WPP Connect.
 * Strips +, spaces, dashes, parentheses.
 * E.g. "+353 87 123 4567" → "353871234567"
 */
function normalisePhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  
  // If the number starts with 0 (e.g., 087 123 4567), default to Irish country code 353
  if (cleaned.startsWith('0')) {
    cleaned = '353' + cleaned.substring(1);
  }
  
  return cleaned;
}

/**
 * Format phone number for WPP Connect chat ID.
 * WPP Connect uses "phonenumber@c.us" format for individual chats.
 */
function toWhatsAppId(phone) {
  const cleaned = normalisePhone(phone);
  if (cleaned.endsWith('@c.us')) return cleaned;
  return `${cleaned}@c.us`;
}

/**
 * Format phone to E.164 for Retell API.
 * Ensures it starts with +.
 */
function toE164(phone) {
  const cleaned = normalisePhone(phone);
  if (cleaned.startsWith('+')) return cleaned;
  return `+${cleaned}`;
}

/**
 * Generate a short, human-readable case ID.
 * Format: GV-YYYYMMDD-XXXX (e.g. GV-20260409-A3F2)
 */
function generateCaseId() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GV-${dateStr}-${random}`;
}

/**
 * Get current ISO timestamp.
 */
function now() {
  return new Date().toISOString();
}

/**
 * Truncate a string to a max length with ellipsis.
 */
function truncate(str, maxLen = 200) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  normalisePhone,
  toWhatsAppId,
  toE164,
  generateCaseId,
  now,
  truncate,
  sleep,
};
