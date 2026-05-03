// Shared Excel → questions parser.
// Used by:
//   - POST /subjects/:subjectId/topics/:topicId/sets/parse-excel  (set creation)
//   - POST /tests/parse-excel                                       (test creation)

import XLSX from 'xlsx';
import { excelQuestionSchema } from '../validators/set.validator.js';

/**
 * Parse an in-memory Excel buffer into `{ parsed, errors, total }`.
 *
 * Same column layout that the existing set-context parser used:
 *   question_type, question_text, option_a-d, correct_answer, marks, question_image_url
 * (image url is forbidden by the schema — we keep accepting it so a clear error
 *  surfaces if the user puts it in the spreadsheet)
 */
export const parseQuestionsExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  if (!rows.length) {
    return { ok: false, status: 400, message: 'Excel file is empty.', errors: [], total: 0 };
  }

  const parsed = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Skip explicit "# Notes:" lines and any row missing a question_type — the
    // sample template ships with note rows the user might leave intact.
    const rawType = String(row['question_type'] || row['Type'] || row['type'] || '').toUpperCase().trim();
    if (!rawType) continue;
    if (rawType.startsWith('#')) continue;

    // Build the candidate object with ONLY the fields that have a value.
    // Joi's `forbidden()` rejects any present key — even null/undefined — so
    // for NAT rows the option columns must be omitted entirely. Likewise the
    // image URL column: blank cells should not surface as `null`.
    const q = {
      question_type: rawType,
      question_text: String(row['question_text'] || row['Question'] || row['Text'] || '').trim(),
      correct_answer: String(row['correct_answer'] || row['Answer'] || row['corr ans'] || '').trim().toLowerCase(),
      marks: Number(row['marks'] || row['Marks'] || 0),
    };

    const optA = String(row['option_a'] || row['Option A'] || row['a'] || '').trim();
    const optB = String(row['option_b'] || row['Option B'] || row['b'] || '').trim();
    const optC = String(row['option_c'] || row['Option C'] || row['c'] || '').trim();
    const optD = String(row['option_d'] || row['Option D'] || row['d'] || '').trim();
    if (optA) q.option_a = optA;
    if (optB) q.option_b = optB;
    if (optC) q.option_c = optC;
    if (optD) q.option_d = optD;

    const imgUrl = String(row['question_image_url'] || row['Image URL'] || '').trim();
    if (imgUrl) q.question_image_url = imgUrl;

    const { error, value } = excelQuestionSchema.validate(q, { abortEarly: false });
    if (error) {
      errors.push({
        row: i + 2,
        errors: error.details.map((d) => d.message),
      });
    } else {
      parsed.push(value);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      status: 400,
      message: 'Excel parsing failed with errors. Note: Excel does not support images.',
      errors,
      error_count: errors.length,
      total: rows.length,
    };
  }

  return {
    ok: true,
    status: 200,
    parsed,
    valid_count: parsed.length,
    total: rows.length,
  };
};
