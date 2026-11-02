import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests run tool calls that append to the shared action log. Point the log at a
// temp file before any test module loads, so no test writes ~/.codecaine/action-log.sqlite.
process.env.CODECAINE_ACTION_LOG = join(mkdtempSync(join(tmpdir(), "canvas-test-action-log-")), "action-log.sqlite");
