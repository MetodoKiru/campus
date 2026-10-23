const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "lib", "english-engine.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
new Function("exports", "require", "module", compiled)(moduleObject.exports, require, moduleObject);
const questions = moduleObject.exports.ENGLISH_A1_DATABASE;

assert.ok(Array.isArray(questions), "ENGLISH_A1_DATABASE must be an array");
assert.equal(questions.length, 100, "The A1 question bank must contain exactly 100 questions");

const ids = questions.map((question) => question.id);
assert.equal(new Set(ids).size, ids.length, "Question IDs must be unique");
assert.deepEqual([...ids].sort((a, b) => a - b), Array.from({ length: 100 }, (_, index) => index + 1), "Question IDs must be consecutive from 1 to 100");

const categories = new Set(["Grammar", "Vocabulary", "Everyday English"]);
const difficulties = new Set(["facil", "medio", "desafiante"]);
for (const question of questions) {
  assert.equal(question.level, "A1", `Question ${question.id} must be A1`);
  assert.ok(question.question.trim(), `Question ${question.id} needs prompt text`);
  assert.equal(question.options.length, 4, `Question ${question.id} must have four options`);
  assert.equal(new Set(question.options).size, 4, `Question ${question.id} must not repeat options`);
  assert.ok(question.options.includes(question.answer), `Question ${question.id} answer must appear in options`);
  assert.ok(categories.has(question.category), `Question ${question.id} has an unknown category`);
  assert.ok(difficulties.has(question.difficulty), `Question ${question.id} has an unknown difficulty`);
  assert.ok(question.unit.startsWith("Unit "), `Question ${question.id} needs a unit`);
}

const units = new Set(questions.map((question) => question.unit));
assert.ok(units.size >= 5, "The A1 bank should cover at least five units");
for (const category of categories) {
  assert.ok(questions.some((question) => question.category === category), `Missing category: ${category}`);
}

console.log(`English engine validation passed: ${questions.length} questions, ${units.size} units, ${categories.size} categories.`);
