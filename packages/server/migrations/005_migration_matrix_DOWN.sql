-- Rollback for 005_migration_matrix.sql. Order matters (FKs).
DROP TABLE IF EXISTS mm_ingest_log;
DROP TABLE IF EXISTS mm_projects;
DROP TABLE IF EXISTS mm_snapshots;
