# Método Kiru — Backup and recovery runbook

## Current automated backups

- Database: `.github/workflows/encrypted-db-backup.yml`
- Supabase Storage: `.github/workflows/encrypted-storage-backup.yml`
- Both workflows encrypt artifacts with `age` and retain artifacts for 90 days.
- The database workflow has a successful run recorded on 2026-10-23.
- The Storage workflow has a successful run recorded on 2026-10-23, but the bucket `kiru-documents` contained 0 objects at that time. A successful empty backup is not proof that file recovery works.

## Required secrets

Repository Actions secrets:
- `SUPABASE_DB_URL`: PostgreSQL Session Pooler connection string, using port 5432.
- `BACKUP_AGE_RECIPIENT`: public age recipient (starts with `age1`).
- `SUPABASE_SERVICE_ROLE_KEY`: privileged key used only by the Storage backup workflow. Never expose it in client-side code, logs, commits, issues, or chat.

## Protect the decryption key

The private age key is created locally as `~/kiru-backup-key.txt`. Keep it outside the repository, never upload it to GitHub, and keep a second protected offline copy. Anyone with this private key and access to an encrypted artifact can decrypt that artifact.

## Restore procedure — not yet recovery-tested

Do not restore over the production database as a test.

1. Download the encrypted artifact from GitHub Actions.
2. Verify its SHA-256 checksum against the accompanying `.sha256` file.
3. Decrypt locally with the private age key, for example:
   `age --decrypt --identity ~/kiru-backup-key.txt --output kiru-db.dump kiru-db.dump.age`
4. Inspect the database dump before restoring:
   `pg_restore --list kiru-db.dump`
5. Restore only into a separate, disposable PostgreSQL/Supabase test project with a compatible PostgreSQL version. Confirm the target host/project before running any restore command.
6. Validate expected tables and row counts, authentication/profile relationships, and application behavior in the isolated environment.
7. For Storage, decrypt the `kiru-storage-*.tar.gz.age` archive and inspect `storage/manifest.json`. Upload files only into a test bucket/project first; preserve object paths.

**Important:** a restore has not been proven until the isolated restore and application checks complete. The Storage backup workflow currently found 0 files because the production bucket was empty; test file recovery after a legitimate test PDF is uploaded through the application, then remove that test file through the application if it is no longer needed.

## Account deletion safety

The admin delete route now refuses deletion when payment history references the target either as the student or as the record creator. It preserves shared app records, notices, documents, and flashcard sets authored by the user by reassigning their creator/audit field to the authenticated admin where appropriate. It deletes student-targeted data and removes document files from the actual bucket `kiru-documents`. The route identifies the failed cleanup step and supports a controlled retry, but cleanup is still a multi-step process rather than one database transaction; a failure can leave partial cleanup. Do not treat deletion as fully production-verified until it is tested with disposable test accounts and a recovery plan.

## Security follow-up

Supabase Security Advisor reports leaked-password protection is disabled. Enable it in Supabase Auth password security settings after reviewing the impact on account creation/password flows.
