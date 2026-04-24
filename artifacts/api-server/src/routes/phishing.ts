import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { predictionsTable } from "@workspace/db";
import { desc, count, avg, sql } from "drizzle-orm";
import { PredictPhishingBody, GetPredictionHistoryQueryParams } from "@workspace/api-zod";
import { readFileSync } from "fs";
import { resolve } from "path";

const router = Router();

type PredictionClass = "Legitimate" | "AI-Generated Suspicious" | "Phishing";
type ThreatLevel = "None" | "Low" | "Medium" | "High" | "Critical";

// =============================================================================
// TRAINING DATASET — loaded from JSON at startup
// 4000 samples (2000 phishing + 2000 legitimate) used to train TF-IDF + LR
// =============================================================================
type TrainingRow = { text: string; label: number };

function loadTrainingData(): TrainingRow[] {
  // Try multiple candidate paths so it works in dev (tsx) and prod (esbuild bundle)
  const candidates = [
    resolve(process.cwd(), "artifacts/api-server/data/training_dataset.json"),
    resolve(process.cwd(), "data/training_dataset.json"),
    resolve(process.cwd(), "../api-server/data/training_dataset.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf8");
      const parsed = JSON.parse(raw) as TrainingRow[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // try next
    }
  }
  return FALLBACK_TRAINING_DATA;
}

const FALLBACK_TRAINING_DATA: TrainingRow[] = [
  // --- PHISHING (label: 1) ---
  { text: "URGENT: Your bank account has been suspended. Click here to verify your password immediately or it will be disabled.", label: 1 },
  { text: "Dear customer, your account will be locked. Login now to confirm your billing information within 24 hours.", label: 1 },
  { text: "You have won a prize! Claim your gift card now. Click here and verify your social security number.", label: 1 },
  { text: "Action required: Unusual activity detected on your account. Click to verify your identity immediately.", label: 1 },
  { text: "Your password will expire in 24 hours. Update your password now to avoid account suspension.", label: 1 },
  { text: "FREE OFFER! Limited time only. Click here to claim your bitcoin reward. Act now do not ignore!", label: 1 },
  { text: "Dear valued customer your credit card has been locked. Verify your account to restore access immediately.", label: 1 },
  { text: "IRS Tax Refund: You are eligible for a tax refund. Click here to claim your money immediately.", label: 1 },
  { text: "ALERT: Suspicious login detected on your account. Confirm your identity now or your account will be terminated.", label: 1 },
  { text: "Congratulations! You have been selected for a $1000 gift card. Verify your bank details to receive your prize.", label: 1 },
  { text: "Your wire transfer of $5000 has been initiated. Click here to cancel if you did not authorize this payment.", label: 1 },
  { text: "PayPal account is limited. Please verify your information and update your password within 24 hours.", label: 1 },
  { text: "Dear user we noticed unusual activity. Update your account details at this link immediately to avoid suspension.", label: 1 },
  { text: "Nigerian prince inheritance: I have $20 million inheritance and need your bank account details urgently.", label: 1 },
  { text: "Your crypto wallet has been compromised. Reset your password now at http://secure-reset.ru/verify to protect your bitcoin.", label: 1 },
  { text: "Account alert: Your email account will expire. Click the link to renew your account and verify password.", label: 1 },
  { text: "You owe unpaid taxes. The IRS will suspend your social security number. Pay immediately to avoid legal action.", label: 1 },
  { text: "WINNER! You have been selected as a lucky winner. Claim your bonus prize. Send your bank account details now.", label: 1 },
  { text: "Security alert: Someone tried to login to your account. Click here to verify and reset your password now.", label: 1 },
  { text: "Final warning: Your account has been flagged for suspicious activity. Verify your credit card details or lose access.", label: 1 },
  { text: "Your Microsoft account is at risk. Verify your identity by clicking here and confirming your password immediately.", label: 1 },
  { text: "Urgent bank notification: unusual activity on your account. Log in now to verify transactions or account will be locked.", label: 1 },
  { text: "Dear customer, as per our records your subscription has expired. Click here to renew and verify billing details.", label: 1 },
  { text: "You have a pending inheritance of $4.5 million. Contact us with your bank details to claim your funds.", label: 1 },
  { text: "Limited offer: Free iPhone 15! Click to verify your address and credit card. Only 3 left. Act now!", label: 1 },
  { text: "Your account will be deleted in 48 hours unless you verify your email and password at this secure link.", label: 1 },
  { text: "Phishing test: Enter your bank password here. Urgent: your account is at risk from suspicious activity.", label: 1 },
  { text: "Update required: your payment method has failed. Click here to update your billing information and avoid suspension.", label: 1 },
  { text: "Dear valued member, your loyalty bonus is ready. Verify your account details to claim $500 bonus credit.", label: 1 },
  { text: "SYSTEM ALERT: Unauthorized access attempt on your account. Verify identity immediately. Click here to secure your account.", label: 1 },

  // --- LEGITIMATE (label: 0) ---
  { text: "Hi Sarah, following up on our meeting last Thursday. Please find the Q3 report attached for your review.", label: 0 },
  { text: "Meeting scheduled tomorrow at 3pm in the main conference room. Please let me know if you have any questions.", label: 0 },
  { text: "Thank you for your order number 12345. Your package will arrive in 3 to 5 business days.", label: 0 },
  { text: "Hi team, please review the attached project timeline and provide your feedback by end of week.", label: 0 },
  { text: "Reminder: quarterly performance review is next Monday. Please come prepared with your accomplishments list.", label: 0 },
  { text: "Looking forward to our call tomorrow. Let me know if the time still works for you or if you need to reschedule.", label: 0 },
  { text: "Please find attached the invoice for last month services. Let me know if you have any questions or concerns.", label: 0 },
  { text: "Hope you had a great vacation! We missed you at the team lunch on Friday. Welcome back to the office.", label: 0 },
  { text: "The project is on track. We will have all the deliverables ready by end of this week as planned.", label: 0 },
  { text: "As discussed in our last meeting, here are the action items we agreed on with their respective owners.", label: 0 },
  { text: "Happy to help with that! Let me know if you need anything else from my end before the deadline.", label: 0 },
  { text: "The design team has finished the mockups for review. Please share your thoughts and any revisions needed.", label: 0 },
  { text: "Lunch tomorrow? There is a new Italian place that just opened near the office that everyone is talking about.", label: 0 },
  { text: "Thank you for your prompt response. We will proceed as discussed in our conversation yesterday.", label: 0 },
  { text: "Just checking in to see how the onboarding is going. Feel free to reach out anytime if you need support.", label: 0 },
  { text: "Attached is the draft proposal for your review. Please send your comments by Thursday so we can finalize.", label: 0 },
  { text: "The conference call has been moved to 2pm. Dial-in details remain the same as before. See you then.", label: 0 },
  { text: "Great work on the presentation! The client was really impressed with the analysis and the data you provided.", label: 0 },
  { text: "Can you send me the updated figures for the Q4 budget? I need them before the board meeting on Friday.", label: 0 },
  { text: "FYI the office will be closed on Monday for the holiday. Enjoy the long weekend and rest well.", label: 0 },
  { text: "Hi, I wanted to introduce myself. I am the new product manager joining the team starting next Monday.", label: 0 },
  { text: "Please review the attached contract and let me know if the terms are acceptable before signing.", label: 0 },
  { text: "The release notes for version 2.4 are attached. Please review and approve before we send to customers.", label: 0 },
  { text: "Following up on the support ticket you submitted. The engineering team has identified the issue and will fix it.", label: 0 },
  { text: "Your subscription renewal is coming up on the 15th. You can manage your plan in the account settings.", label: 0 },
  { text: "Hi John, just wanted to thank you for covering my shift last week. Really appreciate your help.", label: 0 },
  { text: "The weekly standup is moved from Tuesday to Wednesday this week due to a scheduling conflict.", label: 0 },
  { text: "I have reviewed the marketing plan and have a few suggestions. Can we schedule a 30 minute call to discuss?", label: 0 },
  { text: "Sending over the slides from yesterday presentation. Feel free to share with your team as needed.", label: 0 },
  { text: "Your annual performance review is scheduled for next week. Please complete the self-assessment form beforehand.", label: 0 },
];

// =============================================================================
// TF-IDF + LOGISTIC REGRESSION (trained at startup)
// =============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "has",
  "her", "was", "one", "our", "out", "its", "had", "him", "his", "how",
  "did", "get", "may", "now", "than", "that", "this", "they", "will",
  "with", "have", "from", "been", "your", "their", "what", "when", "who",
  "also", "into", "more", "over", "same", "then", "them", "were", "each",
  "she", "him", "via", "per"
]);

// Single-pass: compute vocabulary AND document frequencies together
function buildVocabAndDf(
  data: TrainingRow[],
  minDf = 3,
  maxVocab = 3000,
): { vocab: string[]; docFreq: Record<string, number> } {
  const docFreq: Record<string, number> = {};
  for (const item of data) {
    const tokens = new Set(tokenize(item.text));
    for (const t of tokens) {
      docFreq[t] = (docFreq[t] || 0) + 1;
    }
  }
  // Keep terms appearing in at least minDf documents, then cap vocab size
  const vocab = Object.keys(docFreq)
    .filter((w) => docFreq[w] >= minDf)
    .sort((a, b) => docFreq[b] - docFreq[a])
    .slice(0, maxVocab)
    .sort();
  return { vocab, docFreq };
}

function computeIdfFromDf(vocab: string[], docFreq: Record<string, number>, N: number): Record<string, number> {
  const idf: Record<string, number> = {};
  for (const term of vocab) {
    idf[term] = Math.log((N + 1) / ((docFreq[term] || 0) + 1)) + 1;
  }
  return idf;
}

// Sparse TF-IDF vector: returns only non-zero entries (vocab index → value)
function sparseTfidf(text: string, vocabIndex: Record<string, number>, idf: Record<string, number>): { idx: number[]; val: number[] } {
  const tokens = tokenize(text);
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const total = Math.max(tokens.length, 1);
  const idx: number[] = [];
  const val: number[] = [];
  for (const term in tf) {
    const j = vocabIndex[term];
    if (j !== undefined) {
      idx.push(j);
      val.push((tf[term] / total) * (idf[term] || 0));
    }
  }
  return { idx, val };
}

function sigmoid(x: number): number {
  if (x > 35) return 1;
  if (x < -35) return 0;
  return 1 / (1 + Math.exp(-x));
}

interface LogisticModel {
  weights: number[];
  bias: number;
  vocab: string[];
  vocabIndex: Record<string, number>;
  idf: Record<string, number>;
}

function trainModel(): LogisticModel {
  const data = loadTrainingData();
  const { vocab, docFreq } = buildVocabAndDf(data, 3, 3000);
  const idf = computeIdfFromDf(vocab, docFreq, data.length);

  const vocabIndex: Record<string, number> = {};
  vocab.forEach((w, i) => { vocabIndex[w] = i; });

  // Pre-compute sparse features once
  const features = data.map((d) => sparseTfidf(d.text, vocabIndex, idf));
  const labels = data.map((d) => d.label);

  const weights = new Array(vocab.length).fill(0);
  let bias = 0;
  const lr = 0.5;
  const epochs = 100;
  const l2 = 0.0005;

  // Stochastic gradient descent over sparse vectors → very fast
  for (let epoch = 0; epoch < epochs; epoch++) {
    const rate = lr * Math.exp(-epoch / 50);
    for (let i = 0; i < features.length; i++) {
      const { idx, val } = features[i];
      let z = bias;
      for (let k = 0; k < idx.length; k++) z += val[k] * weights[idx[k]];
      const pred = sigmoid(z);
      const error = pred - labels[i];
      for (let k = 0; k < idx.length; k++) {
        const j = idx[k];
        weights[j] -= rate * (error * val[k] + l2 * weights[j]);
      }
      bias -= rate * error;
    }
  }

  return { weights, bias, vocab, vocabIndex, idf };
}

// Train once at module load
const MODEL_START = Date.now();
const MODEL: LogisticModel = trainModel();
// eslint-disable-next-line no-console
console.log(`[phishing-detector] ML model trained on ${loadTrainingData().length} samples, vocab=${MODEL.vocab.length}, ${Date.now() - MODEL_START}ms`);

function getMlScore(text: string): number {
  const { idx, val } = sparseTfidf(text, MODEL.vocabIndex, MODEL.idf);
  let z = MODEL.bias;
  for (let k = 0; k < idx.length; k++) z += val[k] * MODEL.weights[idx[k]];
  const prob = sigmoid(z);
  return Math.round(prob * 100);
}

// =============================================================================
// RULE-BASED SCORING — Additive (each match = 10–20 points, max 100)
// =============================================================================

const RULE_KEYWORDS: { pattern: string | RegExp; points: number }[] = [
  { pattern: "urgent", points: 15 },
  { pattern: "verify", points: 12 },
  { pattern: "click here", points: 18 },
  { pattern: "password", points: 12 },
  { pattern: "bank account", points: 20 },
  { pattern: "suspend", points: 15 },
  { pattern: "suspended", points: 15 },
  { pattern: "account locked", points: 18 },
  { pattern: "account disabled", points: 18 },
  { pattern: "immediately", points: 10 },
  { pattern: "within 24 hours", points: 15 },
  { pattern: "act now", points: 12 },
  { pattern: "do not ignore", points: 14 },
  { pattern: "confirm your", points: 12 },
  { pattern: "update your", points: 10 },
  { pattern: "social security", points: 20 },
  { pattern: "credit card", points: 15 },
  { pattern: "wire transfer", points: 18 },
  { pattern: "gift card", points: 15 },
  { pattern: "claim your", points: 12 },
  { pattern: "prize", points: 13 },
  { pattern: "winner", points: 13 },
  { pattern: "congratulations", points: 10 },
  { pattern: "bitcoin", points: 15 },
  { pattern: "crypto", points: 12 },
  { pattern: "inheritance", points: 16 },
  { pattern: "nigerian", points: 20 },
  { pattern: "tax refund", points: 16 },
  { pattern: "dear customer", points: 10 },
  { pattern: "dear user", points: 10 },
  { pattern: "valued customer", points: 10 },
  { pattern: /https?:\/\//i, points: 15 },
  { pattern: /www\.\S+/i, points: 12 },
  { pattern: /\d+%\s+off/i, points: 8 },
  { pattern: /action\s+required/i, points: 14 },
  { pattern: /unusual\s+activity/i, points: 16 },
  { pattern: /verify\s+your\s+(identity|account|email|password)/i, points: 18 },
  { pattern: /log\s*in\s+(now|to\s+verify)/i, points: 14 },
  { pattern: /limited\s+time/i, points: 10 },
];

const SAFE_DEDUCTIONS: { pattern: string | RegExp; points: number }[] = [
  { pattern: /meeting\s+(scheduled|at|on)/i, points: 12 },
  { pattern: /kind\s+regards/i, points: 8 },
  { pattern: /best\s+regards/i, points: 8 },
  { pattern: /sincerely/i, points: 6 },
  { pattern: /please\s+find\s+attached/i, points: 10 },
  { pattern: /as\s+discussed/i, points: 10 },
  { pattern: /following\s+up/i, points: 8 },
  { pattern: /let\s+me\s+know\s+if/i, points: 10 },
  { pattern: /looking\s+forward/i, points: 8 },
  { pattern: /quarterly\s+review/i, points: 12 },
  { pattern: /team\s+(lunch|meeting|call)/i, points: 10 },
  { pattern: /project\s+(timeline|update|status)/i, points: 12 },
];

function getRuleScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const rule of RULE_KEYWORDS) {
    const matches =
      typeof rule.pattern === "string"
        ? lower.includes(rule.pattern)
        : rule.pattern.test(text);
    if (matches) score += rule.points;
  }

  for (const rule of SAFE_DEDUCTIONS) {
    const matches =
      typeof rule.pattern === "string"
        ? lower.includes(rule.pattern)
        : rule.pattern.test(text);
    if (matches) score -= rule.points;
  }

  return Math.min(Math.max(score, 0), 100);
}

// =============================================================================
// AI PATTERN DETECTION
// =============================================================================

const AI_PHRASES: { pattern: RegExp; points: number }[] = [
  // Generic greetings (+25 each)
  { pattern: /dear\s+user\b/i, points: 25 },
  { pattern: /dear\s+customer\b/i, points: 25 },
  { pattern: /dear\s+valued\s+(user|customer|member|client)\b/i, points: 25 },
  { pattern: /dear\s+(member|client|subscriber)\b/i, points: 22 },

  // Overly formal / AI boilerplate phrases (+20 each)
  { pattern: /we\s+hope\s+this\s+(message|email|letter)?\s*finds\s+you\s+well/i, points: 20 },
  { pattern: /we\s+are\s+pleased\s+to\s+inform\s+you/i, points: 20 },
  { pattern: /we\s+are\s+excited\s+to\s+inform\s+you/i, points: 20 },
  { pattern: /thank\s+you\s+for\s+your\s+cooperation/i, points: 20 },
  { pattern: /we\s+are\s+writing\s+to\s+(inform|notify|advise)/i, points: 20 },
  { pattern: /i\s+am\s+writing\s+to\s+(inform|notify|advise|bring)/i, points: 18 },
  { pattern: /please\s+be\s+informed\s+that/i, points: 20 },
  { pattern: /this\s+is\s+to\s+(inform|notify)\s+you/i, points: 20 },
  { pattern: /we\s+regret\s+to\s+inform\s+you/i, points: 18 },
  { pattern: /we\s+wish\s+to\s+(inform|notify|advise)/i, points: 20 },

  // Template-style closing phrases (+16 each)
  { pattern: /please\s+do\s+not\s+hesitate\s+to\s+contact/i, points: 16 },
  { pattern: /should\s+you\s+(have|require|need)\s+any\s+(questions|assistance|further)/i, points: 16 },
  { pattern: /at\s+your\s+earliest\s+convenience/i, points: 16 },
  { pattern: /we\s+appreciate\s+your\s+(prompt|immediate)\s+(attention|response)/i, points: 16 },
  { pattern: /thank\s+you\s+for\s+your\s+(time|patience|understanding|attention)/i, points: 14 },

  // Formal / structured indicators (+14 each)
  { pattern: /kindly\s+(note|be\s+informed|be\s+advised)/i, points: 14 },
  { pattern: /it\s+has\s+come\s+to\s+our\s+attention/i, points: 16 },
  { pattern: /as\s+per\s+(our\s+records|our\s+policy|your\s+request)/i, points: 14 },
  { pattern: /in\s+accordance\s+with\s+our/i, points: 12 },
  { pattern: /pursuant\s+to\s+our/i, points: 14 },
  { pattern: /rest\s+assured\s+that/i, points: 12 },
  { pattern: /we\s+take\s+your\s+(privacy|security)\s+very\s+seriously/i, points: 14 },
  { pattern: /for\s+your\s+(security|protection|safety),?\s+we/i, points: 14 },
  { pattern: /going\s+forward[,\s]/i, points: 10 },
  { pattern: /we\s+have\s+noticed\s+(unusual|suspicious)\s+activity/i, points: 14 },
];

function getAiScore(text: string): number {
  let score = 0;

  // 1. Generic greeting detection (+25)
  for (const p of AI_PHRASES) {
    if (p.pattern.test(text)) score += p.points;
  }

  // 2. Lack of personalization: no first-name greeting detected (+15)
  const hasPersonalGreeting = /\b(hi|hey|hello|dear)\s+[A-Z][a-z]{1,}/i.test(text) &&
    !/dear\s+(user|customer|member|valued|client|subscriber)/i.test(text);
  if (!hasPersonalGreeting) score += 15;

  // 3. Template structure: greeting + body + closing detected (+10)
  const hasGreeting = /^(dear|hello|hi|good\s+(morning|afternoon|evening))/im.test(text.trim());
  const hasClosing = /(sincerely|regards|best\s+wishes|warm\s+regards|yours\s+(truly|faithfully)|respectfully)/i.test(text);
  const hasBodyLength = text.split(/\s+/).length > 30;
  if (hasGreeting && hasClosing && hasBodyLength) score += 10;

  // 4. Repetitive neutral / professional tone (+10)
  const neutralPhraseCount = [
    /\bplease\b/gi,
    /\bkindly\b/gi,
    /\bensure\b/gi,
    /\bpromptly\b/gi,
    /\baccordingly\b/gi,
    /\bfurthermore\b/gi,
    /\bmoreover\b/gi,
    /\bhereby\b/gi,
  ].filter((r) => r.test(text)).length;
  if (neutralPhraseCount >= 2) score += 10;

  // 5. Uniform sentence length — AI tends to write very evenly
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 5 && mean > 8) score += 12;
  }

  // 6. High formal vocabulary ratio (long words)
  const words = text.split(/\s+/);
  const longWords = words.filter((w) => w.replace(/[^a-z]/gi, "").length > 9).length;
  const ratio = longWords / Math.max(words.length, 1);
  score += Math.round(Math.min(ratio * 40, 15));

  // Penalize for personal touches (casual greetings with a real name)
  if (/\b(hi|hey|hello)\s+[A-Z][a-z]+/i.test(text) && !(/dear\s+(user|customer|member)/i.test(text))) score -= 15;
  if (/(thanks|cheers|talk\s+soon|catch\s+you\s+later|haha|lol|btw)/i.test(text)) score -= 10;

  return Math.min(Math.max(score, 0), 100);
}

// =============================================================================
// URL EXTRACTION
// =============================================================================

const URL_REGEX = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  URL_REGEX.lastIndex = 0;
  return [...new Set(matches)].slice(0, 10);
}

// =============================================================================
// KEYWORD EXTRACTION
// =============================================================================

const KEYWORD_LIST = [
  "urgent", "verify", "click here", "password", "bank account", "suspend",
  "suspended", "login", "update your", "confirm your", "limited time", "expire",
  "billing", "payment", "social security", "ssn", "credit card", "wire transfer",
  "prize", "winner", "congratulations", "free offer", "alert", "immediately",
  "action required", "unusual activity", "locked", "disabled", "reset",
  "activate", "dear customer", "dear user", "valued customer", "bonus", "claim",
  "gift card", "bitcoin", "crypto", "tax refund", "irs", "inheritance", "nigerian"
];

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return [...new Set(KEYWORD_LIST.filter((kw) => lower.includes(kw)))];
}

// =============================================================================
// TONE DETECTION
// =============================================================================

function detectTone(text: string, aiScore: number, mlScore: number, ruleScore: number): string {
  const hasThreats = /suspend|terminate|delete|disable|close your account|legal action/i.test(text);
  const hasUrgency = /urgent|immediately|now|asap|within 24|don.t delay|limited time/i.test(text);
  const hasFormal = aiScore > 35;
  const hasFriendly = /hope you|looking forward|great to|happy to|excited|cheers/i.test(text);
  const hasCasual = /\b(hi|hey|haha|lol|btw|fyi)\b/i.test(text);

  if (hasThreats && ruleScore > 50) return "Threatening / Manipulative";
  if (hasUrgency && ruleScore > 40) return "Urgent / Pressuring";
  if (hasFormal && aiScore > 50) return "Formal / AI-Structured";
  if (hasFormal && hasUrgency) return "Formal / Urgent";
  if (hasCasual) return "Casual / Conversational";
  if (hasFriendly) return "Friendly / Professional";
  if (hasFormal) return "Formal / Professional";
  return "Neutral";
}

// =============================================================================
// EXPLANATION + SUGGESTIONS
// =============================================================================

function buildExplanation(
  prediction: PredictionClass,
  keywords: string[],
  urls: string[],
  aiScore: number,
  ruleScore: number,
  mlScore: number,
  tone: string
): string {
  if (prediction === "Phishing") {
    const parts: string[] = ["This email exhibits strong phishing indicators."];
    if (keywords.length > 0) parts.push(`Suspicious keywords detected: ${keywords.slice(0, 5).join(", ")}.`);
    if (urls.length > 0) parts.push(`Contains ${urls.length} suspicious URL(s) that may redirect to malicious sites.`);
    if (ruleScore > 60) parts.push("High rule-based score — multiple threat patterns matched.");
    if (mlScore > 70) parts.push("ML model flagged this as high-risk based on phishing vocabulary patterns.");
    if (tone.includes("Urgent") || tone.includes("Threatening")) parts.push("Uses urgency and pressure tactics to manipulate the recipient.");
    return parts.join(" ");
  }

  if (prediction === "AI-Generated Suspicious") {
    const parts: string[] = ["This email appears to be generated or heavily assisted by AI."];
    if (aiScore > 60) parts.push("Contains overly formal phrasing, generic salutations, and uniform sentence structure typical of LLM output.");
    if (ruleScore > 20) parts.push("Some phishing-adjacent language is also present, suggesting possible manipulation intent.");
    parts.push("Verify the sender's identity before taking any action.");
    return parts.join(" ");
  }

  const parts: string[] = ["This email appears to be legitimate."];
  if (keywords.length === 0 && urls.length === 0) parts.push("No suspicious keywords or URLs detected.");
  if (mlScore < 20 && ruleScore < 15) parts.push("ML model and rule engine both returned low risk scores.");
  return parts.join(" ");
}

function buildSuggestions(prediction: PredictionClass, urls: string[]): string[] {
  if (prediction === "Phishing") {
    const s = [
      "Do not click any links or download attachments in this email.",
      "Report this email to your IT security team or email provider as phishing.",
      "Delete the email immediately without responding.",
    ];
    if (urls.length > 0) s.push("Do not visit any of the URLs contained in this message.");
    s.push("If you already clicked a link, change your passwords and run an antivirus scan immediately.");
    return s;
  }
  if (prediction === "AI-Generated Suspicious") {
    return [
      "Verify the sender's identity through a separate, trusted channel (phone or known email).",
      "Do not provide personal information or credentials in response to this email.",
      "Contact the purported sender directly using known contact details — not the reply-to address.",
      "AI-generated emails are increasingly used for social engineering — treat this with caution.",
    ];
  }
  return [
    "This email appears safe. Continue with normal caution.",
    "Always verify unexpected requests even from known senders.",
    "Keep your email client and security software up to date.",
  ];
}

function determineThreatLevel(prediction: PredictionClass, ruleScore: number, mlScore: number): ThreatLevel {
  if (prediction === "Phishing") {
    const combined = Math.max(ruleScore, mlScore);
    if (combined >= 85) return "Critical";
    if (combined >= 70) return "High";
    return "Medium";
  }
  if (prediction === "AI-Generated Suspicious") {
    return "Medium";
  }
  return "None";
}

// =============================================================================
// MAIN ANALYSIS FUNCTION — 3-class classification
// Decision logic (per spec):
//   rule_score > 60 OR ml_score > 70 → Phishing
//   ai_score  > 50                   → AI-Generated Suspicious
//   else                             → Legitimate
// =============================================================================

interface AnalysisResult {
  prediction: PredictionClass;
  confidence: number;
  threat_level: ThreatLevel;
  ml_score: number;
  rule_score: number;
  ai_score: number;
  keywords: string[];
  urls: string[];
  tone: string;
  explanation: string;
  suggestions: string[];
}

function analyze(text: string): AnalysisResult {
  const mlScore = getMlScore(text);
  const ruleScore = getRuleScore(text);
  const aiScore = getAiScore(text);
  const keywords = extractKeywords(text);
  const urls = extractUrls(text);

  let prediction: PredictionClass;
  let rawConf: number;

  if (ruleScore > 60 || mlScore > 70) {
    prediction = "Phishing";
    rawConf = Math.max(ruleScore, mlScore);
  } else if (aiScore > 40) {
    prediction = "AI-Generated Suspicious";
    rawConf = aiScore;
  } else {
    prediction = "Legitimate";
    // Confidence in legitimacy = inverse of the highest risk signal
    const maxRisk = Math.max(ruleScore, mlScore, aiScore);
    rawConf = 100 - maxRisk * 0.5;
  }

  // Clamp confidence to 51–99 (never 0% or 100% — honest uncertainty)
  const confidence = Math.min(Math.max(Math.round(rawConf), 51), 99);
  const threat_level = determineThreatLevel(prediction, ruleScore, mlScore);
  const tone = detectTone(text, aiScore, mlScore, ruleScore);
  const explanation = buildExplanation(prediction, keywords, urls, aiScore, ruleScore, mlScore, tone);
  const suggestions = buildSuggestions(prediction, urls);

  return {
    prediction,
    confidence,
    threat_level,
    ml_score: mlScore,
    rule_score: ruleScore,
    ai_score: aiScore,
    keywords,
    urls,
    tone,
    explanation,
    suggestions,
  };
}

// =============================================================================
// ROUTES
// =============================================================================

router.post("/predict", async (req: Request, res: Response) => {
  const parsed = PredictPhishingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request: text field is required" });
    return;
  }
  const { text } = parsed.data;
  if (!text || text.trim().length === 0) {
    res.status(400).json({ error: "Text cannot be empty" });
    return;
  }

  const result = analyze(text);
  const textPreview = text.length > 120 ? text.slice(0, 117) + "..." : text;

  try {
    await db.insert(predictionsTable).values({
      text_preview: textPreview,
      full_text: text,
      prediction: result.prediction,
      confidence: result.confidence / 100,
      threat_level: result.threat_level,
      ml_score: result.ml_score / 100,
      rule_score: result.rule_score / 100,
      ai_score: result.ai_score / 100,
      keywords: JSON.stringify(result.keywords),
      urls: JSON.stringify(result.urls),
      tone: result.tone,
      explanation: result.explanation,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save prediction to DB");
  }

  res.json(result);
});

router.get("/history", async (req: Request, res: Response) => {
  const parsed = GetPredictionHistoryQueryParams.safeParse(req.query);
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 10;

  try {
    const rows = await db
      .select()
      .from(predictionsTable)
      .orderBy(desc(predictionsTable.created_at))
      .limit(limit);

    const items = rows.map((row) => ({
      id: row.id,
      text_preview: row.text_preview,
      prediction: row.prediction as PredictionClass,
      confidence: Math.round(row.confidence * 100),
      threat_level: row.threat_level,
      keywords: (() => { try { return JSON.parse(row.keywords); } catch { return []; } })(),
      urls: (() => { try { return JSON.parse(row.urls); } catch { return []; } })(),
      tone: row.tone,
      ml_score: Math.round(row.ml_score * 100),
      rule_score: Math.round(row.rule_score * 100),
      ai_score: Math.round(row.ai_score * 100),
      created_at: row.created_at.toISOString(),
    }));

    res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch history");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const totalResult = await db.select({ count: count() }).from(predictionsTable);
    const total = totalResult[0]?.count ?? 0;

    const phishingResult = await db
      .select({ count: count() })
      .from(predictionsTable)
      .where(sql`${predictionsTable.prediction} = 'Phishing'`);
    const phishingCount = phishingResult[0]?.count ?? 0;

    const aiResult = await db
      .select({ count: count() })
      .from(predictionsTable)
      .where(sql`${predictionsTable.prediction} = 'AI-Generated Suspicious'`);
    const aiSuspiciousCount = aiResult[0]?.count ?? 0;

    const avgConfResult = await db
      .select({ avg: avg(predictionsTable.confidence) })
      .from(predictionsTable);
    const avgConfidence = parseFloat(avgConfResult[0]?.avg ?? "0");

    const avgAiResult = await db
      .select({ avg: avg(predictionsTable.ai_score) })
      .from(predictionsTable);
    const avgAiScore = parseFloat(avgAiResult[0]?.avg ?? "0");

    const legitimateCount = total - phishingCount - aiSuspiciousCount;

    res.json({
      total,
      phishing_count: phishingCount,
      ai_suspicious_count: aiSuspiciousCount,
      legitimate_count: legitimateCount,
      phishing_rate: total > 0 ? Math.round((phishingCount / total) * 100) / 100 : 0,
      ai_suspicious_rate: total > 0 ? Math.round((aiSuspiciousCount / total) * 100) / 100 : 0,
      avg_confidence: Math.round(avgConfidence * 10000) / 100,
      avg_ai_score: Math.round(avgAiScore * 10000) / 100,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
