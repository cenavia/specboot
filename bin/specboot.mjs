#!/usr/bin/env node
// specboot — global harness for OpenSpec-driven work that keeps client repos clean.
// Zero dependencies. Requires Node >= 20 and git. OpenSpec CLI is used when present.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA,
  cmdInstall,
  cmdUninstall,
  cmdInit,
  cmdLink,
  cmdSource,
  cmdPreset,
  cmdDoc,
  cmdDocs,
  cmdMode,
  cmdPull,
  cmdDetect,
  cmdMap,
  cmdCheck,
  cmdSync,
  cmdDoctor,
} from '../lib/app.mjs';

const log = (m) => console.log(m);
function die(m) { console.error(`specboot: ${m}`); process.exit(1); }
const realpath = (p) => { try { return fs.realpathSync(p); } catch { return null; } };

const HELP = `specboot - global OpenSpec harness that keeps client repositories clean

Machine (once):
  specboot install              link skills; write global rule; always run efficiency pack (ponytail, caveman,
                                codegraph, rtk, headroom) via bash (macOS/Linux) or PowerShell (Windows).
                                Skip pack: SPECBOOT_SKIP_EFFICIENCY=1
  specboot install --adopt      also back up (~/.specboot-data/backups) and replace skill folders that other
                                tools left under names specboot manages (openspec-* from OpenSpec: always)
  specboot uninstall            remove skill links and global rule (stores are kept)
  specboot source add <path> | remove <path> | list
                                register a folder of your own skills (for example a plugins repository)
  specboot preset list | show | create|update | apply | attach | remove
                         CRUD for generated fronts under ~/.specboot-data/presets/;
                         create go,react | create --from-detect --apply | apply go-react;
                         --apply merges into the client store; --sync pushes; topics-packs with --topics-from

Project (inside the client repository):
  specboot init <client> [--remote <git-url>] [--fronts <file.json> | --stack <tech[,tech...]>]
                         [--topics-from <pack>] [--attach-to <front>]
                         [--new | --existing] [--docs local|client|store] [--gitignore]
                                create/clone the private spec store; --stack may include topics-packs (e.g. ai)
  specboot link                 recreate the openspec/ (and private docs/) links in a new git worktree; refresh the
                                exclude, the pre-commit guard and the Cursor rule (.cursor/rules/specboot.mdc)
  specboot docs [local|client|store]
                                where docs/ (planning, architecture, ADRs) lives: local and ignored (default),
                                versioned in the client repository, or a link to the private store
  specboot doc add <file> [--front <name>] | remove <file> | list
                                register an architecture document of your own; it outranks the base skills
  specboot mode [greenfield|brownfield]
                                show or change the project mode (flip to brownfield once real code exists)
  specboot detect [--json] [--write] [--preset|--from-detect] [--dry-run] [--force] [--apply] [--replace-fronts] [--sync]
                                detect the stack from manifests; --write refreshes openspec/config.yaml;
                                --preset writes a machine fronts preset and reports skill gaps;
                                --apply merges that preset into the registered client's store fronts.json
                                (keeps mode/docs/planning; --replace-fronts overwrites fronts only);
                                --sync also pushes the store (otherwise: specboot sync)
  specboot map [--accept]       inventory rules, fronts and documents; scaffold standards; sync checks.json;
                                --accept records the current versions of skills, skill repositories and documents
  specboot check [--list] [--strict]
                                run the checks in openspec/standards/checks.json (the single list that runs)
  specboot sync [-m <message>]  commit local work, bring in the team's, push (private spec store and local docs/)
  specboot pull                 bring in the team's work without pushing
  specboot doctor [--strict]    verify machine and project setup; --strict also fails on no remote / handoff due

Data lives in ${DATA} (override with SPECBOOT_DATA).`;

const commands = {
  install: cmdInstall,
  uninstall: cmdUninstall,
  init: cmdInit,
  link: cmdLink,
  source: cmdSource,
  preset: cmdPreset,
  doc: cmdDoc,
  docs: cmdDocs,
  mode: cmdMode,
  pull: cmdPull,
  detect: cmdDetect,
  map: cmdMap,
  check: cmdCheck,
  sync: cmdSync,
  doctor: cmdDoctor,
};

export function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') log(HELP);
  else if (commands[cmd]) commands[cmd](rest);
  else die(`unknown command "${cmd}". Run: specboot help`);
}

// npm link exposes a symlink under the global bin; resolve both sides so CLI still runs.
function invokedAsCli() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const self = fileURLToPath(import.meta.url);
  return realpath(argv1) === realpath(self) || path.resolve(argv1) === path.resolve(self);
}

if (invokedAsCli()) main();
