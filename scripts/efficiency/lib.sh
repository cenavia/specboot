#!/usr/bin/env bash
# Shared helpers for SpecBoot efficiency installers.
# shellcheck shell=bash

set -u

EFF_OK=0
EFF_WARN=0
EFF_FAIL=0

eff_log()  { printf '%s\n' "$*"; }
eff_ok()   { printf '  ok    %s\n' "$*"; EFF_OK=$((EFF_OK + 1)); }
eff_warn() { printf '  warn  %s\n' "$*"; EFF_WARN=$((EFF_WARN + 1)); }
eff_fail() { printf '  FAIL  %s\n' "$*"; EFF_FAIL=$((EFF_FAIL + 1)); }

have() { command -v "$1" >/dev/null 2>&1; }

# SPECBOOT_DATA and HARNESS are exported by the Node orchestrator.
: "${SPECBOOT_DATA:=${HOME}/.specboot-data}"
: "${HARNESS:=}"

EFF_SKILLS="${SPECBOOT_DATA}/efficiency-skills"
mkdir -p "${EFF_SKILLS}"

# Download a single file if curl or wget exists.
eff_fetch() {
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if have curl; then
    curl -fsSL "$url" -o "$dest"
  elif have wget; then
    wget -qO "$dest" "$url"
  else
    return 1
  fi
}

# Write a SKILL.md into efficiency-skills/<name>/
eff_write_skill() {
  local name="$1"
  local body="$2"
  local dir="${EFF_SKILLS}/${name}"
  mkdir -p "$dir"
  printf '%s\n' "$body" >"${dir}/SKILL.md"
  eff_ok "efficiency skill ready: ${name}"
}
