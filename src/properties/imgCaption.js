// FIX512.4.2 / FIX512.4.3 / FIX512.4.4 / FIX512.4.5: automatic
// image-caption business rules for <setup-table-caption-rules>
// (FIX512.2.2). Wired into the actual display by FIX520.4.9 (Gallery
// panel / viewer label-img-caption). Mirrors properties/formulas.js's
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

// FIX512.4.5: numeric-aware compare, same spirit as formulas.js's
// (unexported) cmpForEdge -- numeric diff when both sides parse as
// numbers, case-insensitive string compare otherwise.
function compareValues(actual, valueStr) {
  const a = String(actual ?? '');
  const b = String(valueStr ?? '');
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && a.trim() !== '' && b.trim() !== '') {
    return na - nb;
  }
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function lookupPropertyValue(label, folder, propertiesByLabel) {
  const prop = propertiesByLabel.get(label.trim());
  if (!prop) return undefined;
  return computePropertyValue(folder, prop, propertiesByLabel);
}

// FIX512.4.5.1 / FIX512.4.5.2: a single condition, either an existence
// test ({<property> ?}) or a comparison ({<property> <op> <value>}).
function evalSingleCondition(condStr, folder, propertiesByLabel) {
  const s = condStr.trim();
  if (s.endsWith('?')) {
    const value = lookupPropertyValue(s.slice(0, -1), folder, propertiesByLabel);
    return value !== undefined && value !== null && String(value).trim() !== '';
  }
  const m = s.match(/^(.+?)\s*(>=|<=|==|!=|<>|>|<|=)\s*(.+)$/);
  if (!m) return false;
  const actual = lookupPropertyValue(m[1], folder, propertiesByLabel);
  const cmp = compareValues(actual, m[3].trim());
  switch (m[2]) {
    case '>': return cmp > 0;
    case '<': return cmp < 0;
    case '>=': return cmp >= 0;
    case '<=': return cmp <= 0;
    case '=':
    case '==': return cmp === 0;
    case '!=':
    case '<>': return cmp !== 0;
    default: return false;
  }
}

// FIX512.4.5.3: chain of conditions joined by AND/OR, evaluated left to
// right (no precedence rule given in the spec beyond the single
// AND-chained example).
function evalCondition(condStr, folder, propertiesByLabel) {
  const parts = condStr.split(/\s+(AND|OR)\s+/i);
  let result = evalSingleCondition(parts[0], folder, propertiesByLabel);
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i].toUpperCase();
    const val = evalSingleCondition(parts[i + 1], folder, propertiesByLabel);
    result = op === 'AND' ? result && val : result || val;
  }
  return result;
}

// Index of the first top-level occurrence of `ch` in `s` -- one not
// nested inside a {...} pair -- or -1. Lets a term's own {..} placeholders
// contain ':' / ',' without being mistaken for the enclosing block's
// condition/output separators.
function findTopLevelChar(s, ch) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
    else if (s[i] === ch && depth === 0) return i;
  }
  return -1;
}

function findMatchingBrace(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// FIX512.4.5: a {...} block is a conditional term when it has a top-level
// ':' (FIX512.4.5.1/.4.5.2: <condition> : <term1> [, <term2>]); otherwise
// it's a plain FIX512.4.2 {PropertyLabel} placeholder.
function evalBraceExpr(inner, folder, propertiesByLabel) {
  const colonIdx = findTopLevelChar(inner, ':');
  if (colonIdx === -1) {
    const value = lookupPropertyValue(inner, folder, propertiesByLabel);
    return value === undefined ? '' : String(value ?? '');
  }
  const conditionTrue = evalCondition(inner.slice(0, colonIdx), folder, propertiesByLabel);
  const outputStr = inner.slice(colonIdx + 1);
  const commaIdx = findTopLevelChar(outputStr, ',');
  // Bug fix: only strip the single readability space the spec's own
  // examples put right after ':' / ',' ("term1 , term2") -- a trailing
  // space right before the closing '}' (e.g. "{Nombre ? : {Nombre} }") is
  // literal caption content, same as whitespace outside braces (FIX512.4.2),
  // so a full .trim() here was wrongly eating it.
  const term1 = (commaIdx === -1 ? outputStr : outputStr.slice(0, commaIdx)).replace(/^\s+/, '');
  const term2 = commaIdx === -1 ? null : outputStr.slice(commaIdx + 1).replace(/^\s+/, '');
  if (conditionTrue) return resolveCaptionText(term1, folder, propertiesByLabel);
  return term2 == null ? '' : resolveCaptionText(term2, folder, propertiesByLabel);
}

// FIX512.4.2 / FIX512.4.5: replace every {...} block in the caption text.
// A plain {PropertyLabel} resolves to that property's value (unknown
// label or no value on this item -> '', same "unknown -> blank"
// convention as formulas.js's evaluateFormula). A block with a top-level
// ':' is a FIX512.4.5 conditional term -- possibly nested (FIX512.4.5's
// "one or several nested terms"), so term1/term2 are resolved recursively.
export function resolveCaptionText(template, folder, propertiesByLabel) {
  const s = String(template ?? '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '{') {
      const end = findMatchingBrace(s, i);
      if (end === -1) {
        out += s.slice(i);
        break;
      }
      out += evalBraceExpr(s.slice(i + 1, end), folder, propertiesByLabel);
      i = end + 1;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
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
