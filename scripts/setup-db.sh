#!/usr/bin/env bash
# Create TaskForge roles + databases. Run once as superuser.
set -euo pipefail
PSQL="${PSQL:-/c/Program Files/PostgreSQL/17/bin/psql.exe}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
"$PSQL" -h 127.0.0.1 -U postgres <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='taskforge') THEN
    CREATE ROLE taskforge LOGIN PASSWORD 'taskforge';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='taskforge_test') THEN
    CREATE ROLE taskforge_test LOGIN PASSWORD 'taskforge_test';
  END IF;
END $$
SQL
for pair in "taskforge:taskforge" "taskforge_test:taskforge_test"; do
  db="${pair%%:*}"; role="${pair##*:}"
  "$PSQL" -h 127.0.0.1 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    "$PSQL" -h 127.0.0.1 -U postgres -c "CREATE DATABASE $db OWNER $role"
done
"$PSQL" -h 127.0.0.1 -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE taskforge TO taskforge"
"$PSQL" -h 127.0.0.1 -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE taskforge_test TO taskforge_test"
echo "DB setup complete."
