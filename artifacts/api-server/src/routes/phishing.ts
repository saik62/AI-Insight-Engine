import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { predictionsTable } from "@workspace/db";
import { desc, count, avg, sql } from "drizzle-orm";
import { PredictPhishingBody, GetPredictionHistoryQueryParams } from "@workspace/api-zod";

const router = Router();

type PredictionClass = "Legitimate" | "AI-Generated Suspicious" | "Phishing";
type ThreatLevel = "None" | "Low" | "Medium" | "High" | "Critical";

const PHISHING_KEYWORDS = [
  "urgent", "verify", "click", "password", "bank", "account", "suspend",
  "login", "update", "confirm", "limited", "expire", "billing", "payment",
  "social security", "ssn", "credit card", "wire transfer", "prize",
  "winner", "congratulations", "free offer", "risk", "alert", "immediately",
  "action required", "unusual activity", "locked", "disabled", "reset",
  "activate", "dear customer", "dear user", "valued customer",
  "bonus", "claim", "gift card", "bitcoin", "crypto", "tax refund",
  "irs", "inheritance", "million dollars", "nigerian", "prince",
  "unsubscribe", "do not ignore", "account suspended", "verify now",
  "click here", "limited time", "act now", "you have been selected",
  "your account", "confirm your", "update your"
];

const PHISHING_PATTERNS = [
  /click\s+here/i,
  /verify\s+your/i,
  /update\s+your/i,
  /confirm\s+your/i,
  /account\s+(has\s+been\s+)?(suspended|locked|disabled)/i,
  /log\s*in\s+to\s+verify/i,
  /limited\s+time/i,
  /act\s+now/i,
  /do\s+not\s+ignore/i,
  /you\s+have\s+been\s+selected/i,
  /you\s+(have\s+)?(won|are\s+a\s+winner)/i,
  /\d+%\s+off/i,
  /dear\s+(customer|user|member|account\s+holder)/i,
  /your\s+account\s+(will\s+be|has\s+been)/i,
  /action\s+required/i,
  /verify\s+now/i,
  /respond\s+immediately/i,
];

const URL_PATTERN = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/gi;

const SAFE_INDICATORS = [
  /meeting\s+(scheduled|at|on)/i,
  /kind\s+regards/i,
  /best\s+regards/i,
  /sincerely/i,
  /please\s+find\s+attached/i,
  /as\s+discussed/i,
  /following\s+up/i,
  /let\s+me\s+know\s+if/i,
  /looking\s+forward/i,
  /thank\s+you\s+for\s+your/i,
  /hope\s+this\s+(email\s+)?finds\s+you/i,
  /per\s+our\s+(last\s+)?conversation/i,
];

const AI_FORMAL_PHRASES = [
  /i\s+hope\s+this\s+(email\s+)?finds\s+you\s+well/i,
  /i\s+am\s+writing\s+to\s+(inform|notify|advise|bring\s+to\s+your\s+attention)/i,
  /please\s+do\s+not\s+hesitate\s+to\s+contact/i,
  /should\s+you\s+(have\s+any|require\s+any|need\s+any)\s+(questions|assistance|further)/i,
  /we\s+would\s+like\s+to\s+(bring\s+to\s+your|draw\s+your)/i,
  /as\s+per\s+(our\s+records|our\s+policy|your\s+request)/i,
  /kindly\s+(note|be\s+informed|be\s+advised)/i,
  /please\s+be\s+informed\s+that/i,
  /we\s+regret\s+to\s+inform\s+you/i,
  /this\s+is\s+to\s+(inform|notify)\s+you/i,
  /we\s+wish\s+to\s+inform/i,
  /at\s+your\s+earliest\s+convenience/i,
  /we\s+appreciate\s+your\s+(prompt|immediate)\s+(attention|response)/i,
  /thank\s+you\s+for\s+your\s+(prompt|immediate)\s+(response|attention)/i,
  /dear\s+(valued\s+)?(customer|client|user|member|sir|ma'am)/i,
];

const AI_GENERIC_PATTERNS = [
  /your\s+(account|profile|subscription)\s+(has\s+been|is\s+(now|currently))/i,
  /rest\s+assured\s+that/i,
  /we\s+take\s+your\s+(privacy|security)\s+very\s+seriously/i,
  /pursuant\s+to\s+our\s+(policy|terms|agreement)/i,
  /in\s+accordance\s+with\s+our/i,
  /going\s+forward\,/i,
  /it\s+has\s+come\s+to\s+our\s+attention/i,
  /we\s+have\s+noticed\s+(unusual|suspicious)\s+activity/i,
  /for\s+your\s+(security|protection|safety),?\s+we/i,
];

function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) || [];
  return [...new Set(matches)].slice(0, 10);
}

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of PHISHING_KEYWORDS) {
    if (lower.includes(kw)) {
      found.push(kw);
    }
  }
  return [...new Set(found)];
}

function computeRuleScore(text: string): number {
  const lower = text.toLowerCase();
  const matchedKeywords = PHISHING_KEYWORDS.filter(kw => lower.includes(kw));
  const keywordScore = Math.min(matchedKeywords.length / 6, 1) * 0.55;

  let patternMatches = 0;
  for (const pat of PHISHING_PATTERNS) {
    if (pat.test(text)) patternMatches++;
  }
  const patternScore = Math.min(patternMatches / 4, 1) * 0.45;

  let safeReduction = 0;
  for (const pat of SAFE_INDICATORS) {
    if (pat.test(text)) safeReduction += 0.08;
  }

  const hasUrl = URL_PATTERN.test(text) ? 0.1 : 0;
  URL_PATTERN.lastIndex = 0;

  return Math.min(Math.max(keywordScore + patternScore + hasUrl - safeReduction, 0), 1);
}

function computeMlScore(text: string): number {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 2);
  const totalWords = Math.max(words.length, 1);

  const phishingWordSet = new Set(PHISHING_KEYWORDS);
  let phishingWordCount = 0;
  for (const w of words) {
    if (phishingWordSet.has(w)) phishingWordCount++;
  }

  const wordFrequencyScore = Math.min((phishingWordCount / totalWords) * 10, 0.75);
  URL_PATTERN.lastIndex = 0;
  const hasUrl = URL_PATTERN.test(text) ? 0.15 : 0;
  URL_PATTERN.lastIndex = 0;
  const exclamationScore = Math.min((text.match(/!/g) || []).length * 0.05, 0.15);
  const capsWords = text.split(/\s+/).filter(w => w === w.toUpperCase() && w.length > 3).length;
  const capsScore = Math.min(capsWords * 0.04, 0.12);

  let safeReduction = 0;
  for (const pat of SAFE_INDICATORS) {
    if (pat.test(text)) safeReduction += 0.1;
  }

  return Math.min(Math.max(wordFrequencyScore + hasUrl + exclamationScore + capsScore - safeReduction, 0), 1);
}

function computeAiScore(text: string): number {
  let score = 0;

  let formalCount = 0;
  for (const pat of AI_FORMAL_PHRASES) {
    if (pat.test(text)) formalCount++;
  }
  score += Math.min(formalCount / 3, 1) * 0.45;

  let genericCount = 0;
  for (const pat of AI_GENERIC_PATTERNS) {
    if (pat.test(text)) genericCount++;
  }
  score += Math.min(genericCount / 2, 1) * 0.3;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const uniformity = Math.max(0, 1 - stdDev / 8);
    score += uniformity * 0.15;
  }

  const hasPersonalName = /\b(hi|hello|hey)\s+[A-Z][a-z]+/i.test(text);
  if (!hasPersonalName) score += 0.1;

  const hasDearGeneric = /dear\s+(customer|user|member|valued)/i.test(text);
  if (hasDearGeneric) score += 0.15;

  const words = text.split(/\s+/);
  const longWords = words.filter(w => w.length > 9).length;
  const formalVocabRatio = longWords / Math.max(words.length, 1);
  score += Math.min(formalVocabRatio * 2, 0.15);

  return Math.min(Math.max(score, 0), 1);
}

function detectTone(text: string, aiScore: number, phishingScore: number): string {
  const hasUrgency = /urgent|immediately|now|asap|right away|as soon as possible|don't delay/i.test(text);
  const hasFormal = aiScore > 0.35;
  const hasThreats = /suspend|terminate|delete|disable|close your account/i.test(text);
  const hasFriendly = /hope you|looking forward|great to|happy to|excited/i.test(text);

  if (hasThreats && phishingScore > 0.5) return "Threatening / Manipulative";
  if (hasUrgency && phishingScore > 0.3) return "Urgent / Pressuring";
  if (hasFormal && aiScore > 0.5) return "Formal / AI-Structured";
  if (hasFormal && hasUrgency) return "Formal / Urgent";
  if (hasFriendly) return "Friendly / Casual";
  if (hasFormal) return "Formal / Professional";
  return "Neutral";
}

function buildExplanation(
  prediction: PredictionClass,
  keywords: string[],
  urls: string[],
  aiScore: number,
  ruleScore: number,
  tone: string
): string {
  if (prediction === "Phishing") {
    const parts: string[] = ["This email exhibits strong indicators of a phishing attack."];
    if (keywords.length > 0) {
      parts.push(`Suspicious keywords detected: ${keywords.slice(0, 5).join(", ")}.`);
    }
    if (urls.length > 0) {
      parts.push(`Contains ${urls.length} embedded URL(s) that may redirect to malicious sites.`);
    }
    if (tone.includes("Urgent") || tone.includes("Threatening")) {
      parts.push("The tone uses urgency and pressure tactics to manipulate the recipient.");
    }
    return parts.join(" ");
  }

  if (prediction === "AI-Generated Suspicious") {
    const parts: string[] = ["This email appears to be generated or heavily assisted by AI."];
    if (aiScore > 0.6) {
      parts.push("It contains overly formal phrasing, generic greetings, and uniform sentence structure typical of LLM output.");
    }
    if (ruleScore > 0.2) {
      parts.push("Some phishing-adjacent keywords are also present, suggesting possible manipulation intent.");
    }
    parts.push("Verify the sender's identity before taking any action.");
    return parts.join(" ");
  }

  const parts: string[] = ["This email appears to be legitimate."];
  if (keywords.length === 0 && urls.length === 0) {
    parts.push("No suspicious keywords or URLs were detected.");
  }
  parts.push("No significant phishing or AI-generated content indicators were found.");
  return parts.join(" ");
}

function buildSuggestions(prediction: PredictionClass, urls: string[], keywords: string[]): string[] {
  if (prediction === "Phishing") {
    const suggestions = [
      "Do not click any links or download attachments from this email.",
      "Report this email to your IT security team or email provider.",
      "Delete the email immediately without responding.",
      "If you already clicked a link, change your passwords immediately and run a malware scan.",
    ];
    if (urls.length > 0) {
      suggestions.push("Do not visit any URLs contained in this message.");
    }
    return suggestions;
  }

  if (prediction === "AI-Generated Suspicious") {
    return [
      "Verify the sender's identity through a separate, trusted communication channel.",
      "Do not provide personal information or credentials in response to this email.",
      "Contact the purported sender directly using known contact details, not reply-to addresses.",
      "Be cautious — AI-generated emails are increasingly used for social engineering.",
    ];
  }

  return [
    "This email appears safe. Continue with normal caution.",
    "Always verify unexpected requests even from known senders.",
    "Keep your email client and security software up to date.",
  ];
}

function determineThreatLevel(prediction: PredictionClass, confidence: number): ThreatLevel {
  if (prediction === "Phishing") {
    if (confidence >= 90) return "Critical";
    if (confidence >= 75) return "High";
    return "Medium";
  }
  if (prediction === "AI-Generated Suspicious") {
    if (confidence >= 85) return "Medium";
    return "Low";
  }
  return "None";
}

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
  const ruleScore = computeRuleScore(text);
  const mlScore = computeMlScore(text);
  const aiScore = computeAiScore(text);
  const keywords = extractKeywords(text);
  const urls = extractUrls(text);

  const phishingScore = ruleScore * 0.55 + mlScore * 0.45;

  let prediction: PredictionClass;
  let rawConfidence: number;

  if (phishingScore >= 0.28) {
    prediction = "Phishing";
    rawConfidence = 0.5 + phishingScore * 0.49;
  } else if (aiScore >= 0.35 && phishingScore < 0.28) {
    prediction = "AI-Generated Suspicious";
    rawConfidence = 0.5 + aiScore * 0.45;
  } else {
    prediction = "Legitimate";
    const legitimacyScore = 1 - Math.max(phishingScore, aiScore * 0.5);
    rawConfidence = 0.5 + legitimacyScore * 0.45;
  }

  const confidence = Math.round(Math.min(Math.max(rawConfidence, 0.5), 0.99) * 100);
  const threat_level = determineThreatLevel(prediction, confidence);
  const tone = detectTone(text, aiScore, phishingScore);
  const explanation = buildExplanation(prediction, keywords, urls, aiScore, ruleScore, tone);
  const suggestions = buildSuggestions(prediction, urls, keywords);

  return {
    prediction,
    confidence,
    threat_level,
    ml_score: Math.round(mlScore * 100),
    rule_score: Math.round(ruleScore * 100),
    ai_score: Math.round(aiScore * 100),
    keywords,
    urls,
    tone,
    explanation,
    suggestions,
  };
}

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

    const items = rows.map(row => ({
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
