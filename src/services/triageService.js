// ============================================
// Glasslyn Vets — Triage Service
// ============================================
// Determines if a veterinary case is urgent or non-urgent
// based on keyword analysis of the issue description.

const logger = require('../utils/logger');

// ─── Urgent Keywords & Phrases ────────────────────────
// These indicate potentially life-threatening situations
const URGENT_KEYWORDS = [
  // Breathing
  'breathing difficulty', 'can\'t breathe', 'cannot breathe', 'struggling to breathe',
  'laboured breathing', 'labored breathing', 'choking', 'gasping', 'blue gums',
  'blue tongue', 'not breathing', 'respiratory distress', 'panting heavily',

  // Bleeding
  'bleeding', 'blood', 'haemorrhage', 'hemorrhage', 'bleeding heavily',
  'won\'t stop bleeding', 'blood in urine', 'blood in stool', 'vomiting blood',
  'coughing blood', 'bloody diarrhoea', 'bloody diarrhea',

  // Trauma
  'hit by car', 'hit by a car', 'road accident', 'rta', 'run over',
  'fallen from', 'fell from', 'attacked by', 'dog attack', 'fight',
  'impaled', 'puncture wound', 'deep cut', 'deep wound', 'broken bone',
  'fracture', 'crushed', 'trapped',

  // Neurological
  'seizure', 'seizures', 'fitting', 'fit', 'convulsion', 'convulsions',
  'collapse', 'collapsed', 'unconscious', 'unresponsive', 'not responding',
  'can\'t stand', 'cannot stand', 'can\'t walk', 'cannot walk', 'paralysed',
  'paralyzed', 'disoriented', 'head tilt', 'circling',

  // Poisoning
  'poison', 'poisoning', 'poisoned', 'ate chocolate', 'ate rat poison',
  'antifreeze', 'toxic', 'toxin', 'ingested', 'swallowed something',
  'ate something', 'xylitol', 'grapes', 'raisins', 'slug pellets',
  'medication', 'overdose', 'pills',

  // GDV / Bloat
  'bloat', 'bloated', 'stomach swollen', 'belly swollen', 'retching',
  'trying to vomit', 'can\'t vomit', 'cannot vomit', 'distended abdomen',
  'twisted stomach', 'gdv',

  // Birth emergencies
  'giving birth', 'whelping', 'stuck puppy', 'stuck kitten', 'dystocia',
  'can\'t deliver', 'labour', 'labor', 'birthing problems',

  // Eye emergencies
  'eye injury', 'eye popped out', 'proptosis', 'eye bleeding',
  'something in eye', 'eye swollen shut',

  // Other critical
  'not moving', 'lifeless', 'very weak', 'extremely lethargic',
  'won\'t eat or drink', 'hasn\'t eaten in days',
  'swollen abdomen', 'difficulty urinating', 'can\'t urinate', 'cannot urinate',
  'blocked', 'straining', 'heatstroke', 'heat stroke', 'hypothermia',
  'drowning', 'electrocution', 'burn', 'burns', 'severe pain',
  'screaming', 'crying in pain', 'yelping', 'howling in pain',
  'sudden', 'emergency', 'urgent', 'dying', 'about to die', 'critical',
];

// ─── Non-Urgent Keywords ──────────────────────────────
// These suggest the case can wait for normal clinic hours
const NON_URGENT_KEYWORDS = [
  'routine', 'checkup', 'check-up', 'check up', 'vaccination', 'vaccine',
  'booster', 'flea', 'fleas', 'tick', 'ticks', 'worm', 'worming',
  'deworming', 'grooming', 'nail trim', 'nail clipping',
  'microchip', 'neutering', 'spaying', 'dental', 'teeth cleaning',
  'mild limp', 'slight limp', 'scratching', 'itching', 'itchy',
  'skin rash', 'dandruff', 'ear wax', 'smelly ears', 'runny nose',
  'mild cough', 'sneezing', 'weight check', 'diet advice',
  'prescription refill', 'repeat prescription', 'food advice',
  'behaviour', 'behavior', 'training', 'socialisation',
  'appointment', 'booking', 'schedule', 'next available',
];

/**
 * Analyse an issue description and determine urgency.
 * Returns { urgency: 'urgent' | 'non_urgent', reason: string, matchedKeywords: string[] }
 */
function determineUrgency(issueDescription) {
  if (!issueDescription || typeof issueDescription !== 'string') {
    logger.warn('Triage called with empty or invalid description');
    return {
      urgency: 'urgent', // Default to urgent when in doubt (safety first)
      reason: 'Unable to assess — treating as urgent for safety.',
      matchedKeywords: [],
    };
  }

  const descLower = issueDescription.toLowerCase().trim();
  const urgentMatches = [];
  const nonUrgentMatches = [];

  // Check for urgent keywords
  for (const keyword of URGENT_KEYWORDS) {
    if (descLower.includes(keyword)) {
      urgentMatches.push(keyword);
    }
  }

  // Check for non-urgent keywords
  for (const keyword of NON_URGENT_KEYWORDS) {
    if (descLower.includes(keyword)) {
      nonUrgentMatches.push(keyword);
    }
  }

  // Decision logic
  if (urgentMatches.length > 0) {
    // If any urgent keyword is found, it's urgent (safety-first approach)
    const reason = `Urgent indicators detected: ${urgentMatches.slice(0, 3).join(', ')}`;
    logger.info('Triage result: URGENT', { urgentMatches, description: issueDescription.substring(0, 100) });
    return {
      urgency: 'urgent',
      reason,
      matchedKeywords: urgentMatches,
    };
  }

  if (nonUrgentMatches.length > 0) {
    const reason = `Non-urgent indicators: ${nonUrgentMatches.slice(0, 3).join(', ')}`;
    logger.info('Triage result: NON-URGENT', { nonUrgentMatches, description: issueDescription.substring(0, 100) });
    return {
      urgency: 'non_urgent',
      reason,
      matchedKeywords: nonUrgentMatches,
    };
  }

  // If no keywords matched at all, default to urgent (safety-first)
  logger.info('Triage result: URGENT (no keywords matched, defaulting to urgent)', {
    description: issueDescription.substring(0, 100),
  });
  return {
    urgency: 'urgent',
    reason: 'No clear indicators found — treating as urgent for safety.',
    matchedKeywords: [],
  };
}

module.exports = { determineUrgency };
