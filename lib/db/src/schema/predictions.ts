import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  text_preview: text("text_preview").notNull(),
  full_text: text("full_text").notNull(),
  prediction: text("prediction").notNull(),
  confidence: real("confidence").notNull(),
  threat_level: text("threat_level").notNull().default("None"),
  ml_score: real("ml_score").notNull(),
  rule_score: real("rule_score").notNull(),
  ai_score: real("ai_score").notNull().default(0),
  keywords: text("keywords").notNull(),
  urls: text("urls").notNull().default("[]"),
  tone: text("tone").notNull().default("Neutral"),
  explanation: text("explanation").notNull().default(""),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertPredictionSchema = createInsertSchema(predictionsTable).omit({ id: true, created_at: true });
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictionsTable.$inferSelect;
