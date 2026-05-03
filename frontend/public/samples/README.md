# Sample Excel templates

These three workbooks ship with the frontend so users have a starting point for the bulk-import flows:

- `students_sample.xlsx` — bulk students (Admin → Users → Bulk import)
- `staffs_sample.xlsx`   — bulk staff (Admin → Users → Bulk import)
- `set_questions_sample.xlsx` — practice-set questions (Set editor → Import from Excel)

Each workbook has a header row + several example rows + a small "# Notes" block at the bottom explaining the rules.

## Regenerating these files

If columns or rules change, regenerate from the backend (where the `xlsx` package is already installed):

```bash
cd necgpp-mar26
node -e "$(cat <<'JS'
  // (paste the writeBook helper + writeBook(...) calls)
JS
)"
```
