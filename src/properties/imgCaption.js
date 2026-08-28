// FIX512.4.2 / FIX512.4.3 / FIX512.4.3.1: automatic image-caption business
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

// FIX512.4.3 / FIX512.4.3.1: a rule applies when the item's category value
// matches <img-caption-category> per the row's Op, AND -- only when the
// rule also has a Shape set -- the item's shape value matches it the same
// way. A rule with no category at all never matches anything (the whole
// feature is category-driven per FIX512.1).
export function captionRuleMatches(rule, categoryValue, shapeValue) {
  const ruleCategory = (rule.category ?? '').trim();
  if (!ruleCategory) return false;
  if (!opMatches(rule.op || 'is', ruleCategory, categoryValue)) return false;
  const ruleShape = (rule.shape ?? '').trim();
  if (ruleShape && !opMatches(rule.op || 'is', ruleShape, shapeValue)) return false;
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
// caption text. null when no rule matches or category/shapeProperty
// aren't configured (FIX506.2.5 / FIX506.2.6).
export function computeImageCaption(rules, folder, categoryProperty, shapeProperty, propertiesByLabel) {
  if (!categoryProperty) return null;
  const categoryValue = computePropertyValue(folder, categoryProperty, propertiesByLabel);
  const shapeValue = shapeProperty
    ? computePropertyValue(folder, shapeProperty, propertiesByLabel)
    : '';
  const match = (rules ?? []).find((r) => captionRuleMatches(r, categoryValue, shapeValue));
  if (!match) return null;
  return resolveCaptionText(match.text, folder, propertiesByLabel);
}
