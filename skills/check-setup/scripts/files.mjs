// Tolerant file reads: a missing or unreadable file is `null`, never an exception.
import { readFileSync } from 'node:fs';

export function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Parsed JSON, or null when the file is missing, unreadable or not valid JSON. */
export function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
