#!/usr/bin/env bash
# Fail when a migration (after the security-hardening baseline) replaces a
# restricted SECURITY DEFINER RPC without re-applying grants in the same file.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="${ROOT}/supabase/migrations"
CUTOFF=20260901140000

RESTRICTED='bulk_update_skill_embeddings|recalculate_matches_for_user|recalculate_matches_for_job|enqueue_job_match_recalc|process_job_match_recalc_queue|purge_request_logs|reset_restore_identity_sequences|trigger_recalculate_job_matches|trigger_recalculate_user_matches|verify_user_password|handle_auth_user_created'

# Match CREATE [OR REPLACE] FUNCTION across line breaks and SQL comments.
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

echo "Restricted RPC migration check passed."
