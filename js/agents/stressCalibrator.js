/**
 * stressCalibrator.js — Client-side heuristic stress detection.
 * Runs instantly before any network request. No LLM call needed.
 * 
 * Returns: 'CRISIS' | 'CASEWORKER' | 'NORMAL'
 * 
 * NOTE: Stress mode is NEVER displayed to the user as a label.
 * It is used internally to drive UI pacing and instant safety responses.
 */
export default function calibrateStress(text) {
  if (!text || typeof text !== 'string') return 'NORMAL';
  
  const textLower = text.toLowerCase();
  
  // Tier 1: Always CRISIS on single match (unambiguous danger)
  const tier1Crisis = ['suicide', 'kill myself', 'kill me', 'end my life', 'trafficking'];
  const isTier1 = tier1Crisis.some(kw => textLower.includes(kw));
  if (isTier1) return 'CRISIS';
  
  // Tier 2: Requires 2+ matches (can appear in non-crisis housing contexts)
  const tier2Crisis = ['abuse', 'abused', 'hit me', 'hits me', 'beats me', 'beaten', 'violent', 'violence', 'weapon', 'gun', 'knife', 'police', 'emergency', 'blood', 'bleeding', 'danger', 'dangerous', 'threatening', 'threatened', 'restraining order', 'protective order', 'stalking', 'stalker'];
  const tier2Count = tier2Crisis.filter(kw => textLower.includes(kw)).length;
  if (tier2Count >= 2) return 'CRISIS';
  
  // High stress/fragmentation indicators
  const fragmentation = (text.match(/!|\?|\.\.\./g) || []).length;
  const uppercaseRatio = text.length > 0 ? (text.replace(/[^A-Z]/g, '').length / text.length) : 0;
  const urgentKeywords = ['now', 'today', 'urgent', 'homeless', 'evicted', 'kicked out', 'desperate', 'scared', 'terrified', 'help', 'please help', 'nowhere to go', 'sleeping in car'];
  const urgentCount = urgentKeywords.filter(keyword => textLower.includes(keyword)).length;
  
  if (fragmentation > 5 || uppercaseRatio > 0.3 || urgentCount >= 2) {
    return 'CASEWORKER';
  }
  
  return 'NORMAL';
}
