#!/usr/bin/env bash
# Fail when a migration (after the security-hardening baseline) replaces a
# restricted SECURITY DEFINER RPC without re-applying grants in the same file.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="${ROOT}/supabase/migrations"
BASELINE="${MIGRATIONS}/20260901140000_supabase_security_hardening.sql"
CUTOFF=20260901140000

# Single source of truth: function names from revoke lines in the baseline migration.
RESTRICTED="$(
	grep -E 'revoke all on function public\.' "${BASELINE}" |
		grep -oE 'public\.[a-z_0-9]+' |
		sed 's/public\.//' |
		grep -v '^apply_restricted_rpc_grants$' |
		sort -u |
		paste -sd'|' -
)"

if [[ -z ${RESTRICTED} ]]; then
	echo "ERROR: could not derive restricted RPC list from ${BASELINE}" >&2
	exit 1
fi

# Match CREATE [OR REPLACE] FUNCTION across line breaks.
RESTRICTED_FN_PATTERN="create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?(?:${RESTRICTED})\\b"

failed=0

for file in "${MIGRATIONS}"/*.sql; do
	base="$(basename "${file}")"
	ts="${base%%_*}"

	# Grandfather historical migrations; enforce on new work only.
	if ((ts < CUTOFF)); then
		continue
	fi

	if perl -0777 -ne "exit((/${RESTRICTED_FN_PATTERN}/is) ? 0 : 1)" "${file}"; then
		if ! grep -q 'apply_restricted_rpc_grants' "${file}"; then
			echo "ERROR: ${base} replaces a restricted RPC but does not call apply_restricted_rpc_grants()" >&2
			failed=1
		fi
	fi
done

if [[ ${failed} -ne 0 ]]; then
	exit 1
fi

echo "Restricted RPC migration check passed (${RESTRICTED//|/, })."
