import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { predictionsTable } from "@workspace/db";
import { desc, count, avg, sql } from "drizzle-orm";
import { PredictPhishingBody, GetPredictionHistoryQueryParams } from "@workspace/api-zod";

const router = Router();

const PHISHING_KEYWORDS = [
  "urgent", "verify", "click", "password", "bank", "account", "suspend",
  "login", "update", "confirm", "limited", "expire", "billing", "payment",
  "social security", "ssn", "credit card", "wire transfer", "prize",
  "winner", "congratulations", "free", "risk", "alert", "immediately",
  "action required", "unusual activity", "locked", "disabled", "reset",
  "activate", "unsubscribe", "dear customer", "dear user", "valued customer",
  "bonus", "claim", "gift card", "bitcoin", "crypto", "tax refund",
  "irs", "inheritance", "million dollars", "nigerian", "prince"
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
  /http[s]?:\/\/[^\s]+/i,
];

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
];

interface HybridResult {
  prediction: "Phishing" | "Safe";
  confidence: number;
  keywords: string[];
  ml_score: number;
  rule_score: number;
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
  let score = 0;
  const maxKeywordScore = 0.6;
  const maxPatternScore = 0.4;

  const matchedKeywords = PHISHING_KEYWORDS.filter(kw => lower.includes(kw));
  const keywordScore = Math.min(matchedKeywords.length / 6, 1) * maxKeywordScore;

  let patternMatches = 0;
  for (const pat of PHISHING_PATTERNS) {
    if (pat.test(text)) patternMatches++;
  }
  const patternScore = Math.min(patternMatches / 4, 1) * maxPatternScore;

  let safeBonus = 0;
  for (const pat of SAFE_INDICATORS) {
    if (pat.test(text)) {
      safeBonus += 0.12;
    }
  }

  score = Math.max(0, keywordScore + patternScore - safeBonus);
  return Math.min(score, 1);
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

  const wordFrequencyScore = Math.min(phishingWordCount / totalWords * 8, 0.8);

  const hasUrl = /https?:\/\//i.test(text) ? 0.15 : 0;
  const hasExclamation = (text.match(/!/g) || []).length;
  const exclamationScore = Math.min(hasExclamation * 0.05, 0.15);
  const hasCaps = text.split(/\s+/).filter(w => w === w.toUpperCase() && w.length > 3).length;
  const capsScore = Math.min(hasCaps * 0.04, 0.12);

  let safeReduction = 0;
  for (const pat of SAFE_INDICATORS) {
    if (pat.test(text)) safeReduction += 0.1;
  }

  const score = Math.max(0, wordFrequencyScore + hasUrl + exclamationScore + capsScore - safeReduction);
  return Math.min(score, 1);
}

function hybridAnalysis(text: string): HybridResult {
  const ruleScore = computeRuleScore(text);
  const mlScore = computeMlScore(text);
  const keywords = extractKeywords(text);

  const finalScore = (ruleScore * 0.55 + mlScore * 0.45);

  const threshold = 0.25;
  const prediction: "Phishing" | "Safe" = finalScore >= threshold ? "Phishing" : "Safe";

  let confidence: number;
  if (prediction === "Phishing") {
    confidence = 0.5 + finalScore * 0.5;
  } else {
    confidence = 0.5 + (1 - finalScore) * 0.5;
  }
  confidence = Math.min(Math.max(confidence, 0.5), 0.99);

  if (keywords.length > 0 && prediction === "Safe") {
    confidence = Math.max(confidence - keywords.length * 0.03, 0.5);
  }

  return {
    prediction,
    confidence: Math.round(confidence * 100) / 100,
    keywords,
    ml_score: Math.round(mlScore * 100) / 100,
    rule_score: Math.round(ruleScore * 100) / 100,
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

  const result = hybridAnalysis(text);

  const textPreview = text.length > 120 ? text.slice(0, 117) + "..." : text;

  try {
    await db.insert(predictionsTable).values({
      text_preview: textPreview,
      full_text: text,
      prediction: result.prediction,
      confidence: result.confidence,
      ml_score: result.ml_score,
      rule_score: result.rule_score,
      keywords: JSON.stringify(result.keywords),
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
      prediction: row.prediction as "Phishing" | "Safe",
      confidence: row.confidence,
      keywords: (() => {
        try {
          return JSON.parse(row.keywords);
        } catch {
          return [];
        }
      })(),
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
    const totalResult = await db
      .select({ count: count() })
      .from(predictionsTable);
    const total = totalResult[0]?.count ?? 0;

    const phishingResult = await db
      .select({ count: count() })
      .from(predictionsTable)
      .where(sql`${predictionsTable.prediction} = 'Phishing'`);
    const phishingCount = phishingResult[0]?.count ?? 0;

    const avgResult = await db
      .select({ avg: avg(predictionsTable.confidence) })
      .from(predictionsTable);
    const avgConfidence = parseFloat(avgResult[0]?.avg ?? "0");

    const safeCount = total - phishingCount;
    const phishingRate = total > 0 ? phishingCount / total : 0;

    res.json({
      total,
      phishing_count: phishingCount,
      safe_count: safeCount,
      phishing_rate: Math.round(phishingRate * 100) / 100,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
