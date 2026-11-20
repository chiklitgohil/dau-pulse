/**
 * Keyword tripwire for sensitive reports. It runs on every report *in addition to* the model's
 * judgement, and either one is enough to route a report to the grievance committee.
 *
 * Tuned for recall: a false alarm costs the committee a minute to reclassify; a missed ragging
 * or harassment report costs far more. Includes common Hinglish phrasings.
 */

const SENSITIVE_PATTERNS: Array<[label: string, re: RegExp]> = [
  ['ragging', /\bragg(?:ing|ed|er|ers)?\b/i],
  ['harassment', /\bharass(?:ed|ing|ment|es)?\b/i],
  ['sexual', /\bsexual(?:ly)?\b|\bmolest|\binappropriate(?:ly)? touch|\btouched me\b|\bgroped?\b/i],
  ['assault', /\bassault(?:ed)?\b|\bbeat(?:en)? (?:me|us|him|her)\b|\bhit me\b|\bslapped\b/i],
  ['stalking', /\bstalk(?:ing|ed|er)?\b|\bfollowing me\b|\bfollows me\b/i],
  ['bullying', /\bbull(?:y|ied|ying)\b/i],
  ['threat', /\bthreat(?:en(?:s|ed|ing)?|s)?\b|\bblackmail/i],
  ['abuse', /\babus(?:e|ed|ive|ing)\b/i],
  ['discrimination', /\bdiscriminat(?:e|ed|ion|ing)\b|\bcasteist\b|\bcaste (?:remark|slur|based)\b/i],
  ['eve-teasing', /\beve[\s-]?teas(?:e|ing)\b|\bchhed(?:na|te|ta|ti|khani)\b/i],
  ['hinglish-pressure', /\bpareshan kar(?:te|ta|ti|na)\b|\bdhamki\b|\bmaar(?:a|te|ta|pit)\b/i],
  // Ragging rarely uses the word: seniors making juniors do things, "tradition", "intro".
  ['coercion', /\bforc(?:e|ed|es|ing)\s+(?:us|me|him|her|them|juniors?|freshers?|first[\s-]?years?)\b|\bseniors?\b[^.!?]{0,60}\b(?:made|make|making|forced|called)\s+(?:us|me|juniors?|freshers?)\b/i],
  ['silencing', /\b(?:if|don'?t|not to)\s+(?:we\s+|i\s+)?(?:tell|told|report(?:ed)?)\s+any(?:one|body)\b|\bin trouble if\b|\bif i complain\b|\bretaliat/i],
  ['inappropriate', /\binappropriate\b|\bvulgar\b|\bobscene\b|\blewd\b/i],
  ['caste-religion', /\bcaste\b|\breligion\b[^.!?]{0,40}\b(?:mock|insult|abuse|tease|comment)/i],
  // The student asks for confidentiality: by policy that goes to the committee.
  ['confidential-request', /\bkeep (?:this|it) (?:confidential|private|secret)\b|\bconfidential(?:ly)?\b|\bdon'?t (?:reveal|share|disclose) my (?:name|identity)\b/i],
];

const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(?:e|al)\b/i,
  /\bkill (?:my ?self|myself)\b/i,
  /\bend (?:it all|my life)\b/i,
  /\bwant to die\b|\bwanna die\b/i,
  /\bself[\s-]?harm/i,
  /\bhurt(?:ing)? myself\b/i,
  /\bmarna chahta\b|\bmarna chahti\b|\bjeena nahi\b/i,
];

export type TripwireResult = {
  /** Should be handled by the grievance committee. */
  sensitive: boolean;
  /** Possible self-harm: show crisis support to the student immediately. */
  crisis: boolean;
  matched: string[];
};

export function checkTripwire(text: string): TripwireResult {
  const matched = SENSITIVE_PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => label);
  const crisis = CRISIS_PATTERNS.some((re) => re.test(text));
  if (crisis) matched.push('crisis');
  return { sensitive: matched.length > 0, crisis, matched };
}

/** Shown to a student whose report mentions self-harm. India-wide, 24×7, free. */
export const CRISIS_SUPPORT_MESSAGE =
  "If you're thinking about hurting yourself, please talk to someone now. Tele-MANAS (free, 24×7, confidential): call 14416 or 1-800-891-4416. You can also go to the campus Medical Centre or call a friend you trust.";
