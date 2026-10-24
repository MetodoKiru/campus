import { A1_GRAMMAR, A1_VOCABULARY, GrammarItem } from "@/lib/english/a1-content";
import { A1_READING, ReadingText } from "@/lib/english/a1-reading";
import { A2_GRAMMAR, A2_VOCABULARY } from "@/lib/english/a2-content";
import { A2_READING } from "@/lib/english/a2-reading";
import { B1_GRAMMAR, B1_VOCABULARY } from "@/lib/english/b1-content";
import { B1_READING } from "@/lib/english/b1-reading";

// All content banks by key. A2 and B1 keys carry their level prefix ("a2_", "b1_"),
// so a bank key is unique across levels.

export const VOCABULARY: Record<string, string[]> = { ...A1_VOCABULARY, ...A2_VOCABULARY, ...B1_VOCABULARY };
export const GRAMMAR: Record<string, GrammarItem[]> = { ...A1_GRAMMAR, ...A2_GRAMMAR, ...B1_GRAMMAR };
export const READING: ReadingText[] = [...A1_READING, ...A2_READING, ...B1_READING];
