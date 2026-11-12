export const REASON_CODES = ["recent_comparable", "condition", "location_premium", "legal_title", "market_event", "other"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
