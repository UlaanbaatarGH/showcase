// FIX512.4.2 / FIX512.4.3 / FIX512.4.4: automatic image-caption business
// rules for <setup-table-caption-rules> (FIX512.2.2). Not called from
// anywhere yet -- no FIX has wired this into an actual caption display
// (Gallery panel, viewer, etc.); this is the computation the eventual
// wiring FIX will call. Mirrors properties/formulas.js's
// computePropertyValue / propertiesByLabel lookup pattern.

import { computePropertyValue } from './formulas.js';

// FIX512.4.3: exact ('is') or prefix ('starts with') match, case-sensitive
// (no case-folding rule given in the spec).
function opMatches(op, ruleValue, actualValue) {
  const a = String(actualValue ?? '');
  return op === 'starts with' ? a.startsWith(ruleValue) : a === ruleValue;
}

// FIX512.4.3 (updated, deep-old retires the earlier .4.3/.4.3.1 pair): a
// rule applies when the item's category value matches <img-caption-category>
// AND its shape value matches <img-caption-shape>, both per the row's Op.
// FIX512.4.4: either condition is simply skipped (not required) when that
// column is blank on the rule -- so a rule with both blank matches every
// item (a catch-all, useful as a last fallback row given first-match-wins
// order), unlike the earlier FIX512.4.1(old)/.4.3.1 rule where a blank
// category meant "never matches".
export function captionRuleMatches(rule, categoryValue, shapeValue) {
  const op = rule.op || 'is';
  const ruleCategory = (rule.category ?? '').trim();
  if (ruleCategory && !opMatches(op, ruleCategory, categoryValue)) return false;
  const ruleShape = (rule.shape ?? '').trim();
  if (ruleShape && !opMatches(op, ruleShape, shapeValue)) return false;
  return true;
}

// FIX512.4.2: replace every {PropertyLabel} in the caption text with that
// property's value on the given item. An unknown label or a property with
// no value on this item resolves to '' (same "unknown -> blank" convention
// as formulas.js's evaluateFormula), not a literal "{Label}" left in place.
export function resolveCaptionText(template, folder, propertiesByLabel) {
  return String(template ?? '').replace(/\{([^{}]+)\}/g, (_, label) => {
    const prop = propertiesByLabel.get(label.trim());
    if (!prop) return '';
    return String(computePropertyValue(folder, prop, propertiesByLabel) ?? '');
  });
}

// Full pipeline: find the first rule (in table order -- FIX512.2.12/.13's
// Up/Down only make sense if order picks a winner among several matches)
// whose Category/Shape condition matches this item, and resolve its
// caption text. null when no rule matches. Bug fix: no longer bails out
// just because the project has no category property configured
// (FIX506.2.5) -- FIX512.4.4 means a rule can be category-agnostic, so a
// catch-all rule (both columns blank) must still work even then.
export function computeImageCaption(rules, folder, categoryProperty, shapeProperty, propertiesByLabel) {
  const categoryValue = categoryProperty
    ? computePropertyValue(folder, categoryProperty, propertiesByLabel)
    : '';
  const shapeValue = shapeProperty
    ? computePropertyValue(folder, shapeProperty, propertiesByLabel)
    : '';
  const match = (rules ?? []).find((r) => captionRuleMatches(r, categoryValue, shapeValue));
  if (!match) return null;
  return resolveCaptionText(match.text, folder, propertiesByLabel);
}
