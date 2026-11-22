#!/usr/bin/env bash
# SpecBoot efficiency pack — run by `specboot install` (always, unless SPECBOOT_SKIP_EFFICIENCY=1).
# shellcheck shell=bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

eff_log "specboot efficiency pack"
eff_log "  DATA=${SPECBOOT_DATA}"
eff_log "  HARNESS=${HARNESS:-"(unset)"}"
eff_log ""

FAILED=0
run_one() {
  local script="$1"
  local rc=0
  # Subprocess so each installer has isolated state; do not abort the pack on failure.
  bash "${SCRIPT_DIR}/${script}" || rc=$?
  if [[ "${rc}" -ne 0 ]]; then
    FAILED=1
    eff_warn "${script} exited ${rc}"
  fi
  eff_log ""
}

run_one install-ponytail.sh
run_one install-caveman.sh
run_one install-codegraph.sh
run_one install-rtk.sh
run_one install-headroom.sh

eff_log "efficiency pack finished"
exit "${FAILED}"
