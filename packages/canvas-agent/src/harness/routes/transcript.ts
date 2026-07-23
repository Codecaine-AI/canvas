/**
 * Pi-session transcript read routes.
 *
 *   GET /api/agent/kernel/sessions/:containerId/transcript
 *     Parse every jsonl under <piSessionsDir>/<containerId>/<agent-name>/ and
 *     return the container's transcript: per pi session, the user messages,
 *     agent-context payload, and assistant "turns" (one per assistant message,
 *     with tool calls joined to their results). Image bytes are NOT inlined —
 *     each image block is referenced by a stable id resolvable via:
 *
 *   GET /api/agent/kernel/sessions/:containerId/transcript/images/:imageId
 *     Re-locate the referenced jsonl line and stream the decoded image bytes.
 *
 * Image id format: `<fileBase>.<lineIndex>.<blockIndex>` where fileBase is the
 * jsonl basename without extension (`<timestamp>_<piSessionId>` — URL-safe,
 * dot-free), lineIndex is the 0-based jsonl line of the tool-result event, and
 * blockIndex is the 0-based index into that message's content blocks. The id
 * alone re-locates the bytes; no index file needed. Transcripts are
 * append-only, so image responses carry cache-control: max-age=3600.
 *
 * Malformed jsonl lines are skipped, never fatal. Unknown container or image
 * → 404 { error } (matching kernel-read.ts error-body style).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { Elysia } from "elysia";

import { PI_SESSIONS_DIR } from "../kernel";

/** URL-safe, dot-free path segment — container ids and jsonl basenames. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

interface TranscriptImageRef {
  id: string;
  mimeType: string;
}

interface TranscriptToolCall {
  toolUseId: string;
  toolName: string;
  params: Record<string, unknown>;
  resultText: string | null;
  isError: boolean;
  images: TranscriptImageRef[];
}

interface TranscriptTurn {
  index: number;
  timestamp: string | null;
  thinking: string | null;
  text: string | null;
  toolCalls: TranscriptToolCall[];
}

interface TranscriptUserMessage {
  text: string;
  timestamp: string | null;
}

interface PiSessionTranscript {
  piSessionId: string;
  file: string;
  startedAt: string | null;
  userMessages: TranscriptUserMessage[];
  agentContext: string | null;
  turns: TranscriptTurn[];
}

interface ContainerTranscript {
  container_id: string;
  pi_sessions: PiSessionTranscript[];
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function contentBlocks(carrier: JsonRecord): JsonRecord[] {
  const content = carrier.content;
  if (!Array.isArray(content)) return [];
  return content.map(asRecord).filter((block): block is JsonRecord => block !== null);
}

/** Concatenate the given block field across blocks of one type, or null. */
function joinBlocks(blocks: JsonRecord[], type: string, field: string): string | null {
  const parts = blocks
    .filter((block) => block.type === type)
    .map((block) => asString(block[field]))
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** All jsonl files under <containerDir>, one level of agent-name subdirs deep. */
function listJsonlFiles(containerDir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(containerDir)) {
    const entryPath = join(containerDir, entry);
    let isDir = false;
    try {
      isDir = statSync(entryPath).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      for (const inner of readdirSync(entryPath)) {
        if (inner.endsWith(".jsonl")) files.push(join(entryPath, inner));
      }
    } else if (entry.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  // Filename = <timestamp>_<piSessionId>.jsonl, so basename order is
  // chronological (refine runs append later-timestamped files).
  files.sort((a, b) => basename(a).localeCompare(basename(b)));
  return files;
}

function basename(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  return slash === -1 ? filePath : filePath.slice(slash + 1);
}

function parsePiSessionFile(filePath: string): PiSessionTranscript {
  const file = basename(filePath);
  const fileBase = file.replace(/\.jsonl$/, "");
  const underscore = fileBase.indexOf("_");
  const piSessionId = underscore === -1 ? fileBase : fileBase.slice(underscore + 1);

  const session: PiSessionTranscript = {
    piSessionId,
    file,
    startedAt: null,
    userMessages: [],
    agentContext: null,
    turns: [],
  };

  const lines = readFileSync(filePath, "utf8").split("\n");
  // Tool-call ids are unique within a session; results arrive after the call.
  const pendingCalls = new Map<string, TranscriptToolCall>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (line.length === 0) continue;
    let event: JsonRecord | null;
    try {
      event = asRecord(JSON.parse(line));
    } catch {
      continue; // malformed line — skip, never fatal
    }
    if (!event) continue;

    const type = event.type;
    if (type === "session") {
      session.startedAt ??= asString(event.timestamp);
      continue;
    }
    if (type === "custom_message" && event.customType === "agent-context") {
      session.agentContext ??= asString(event.content);
      continue;
    }

    // Tool results can arrive as a message-role event or a top-level event.
    const message = type === "message" ? asRecord(event.message) : null;
    const resultCarrier = type === "toolResult" ? event : message?.role === "toolResult" ? message : null;
    if (resultCarrier) {
      const toolCallId = asString(resultCarrier.toolCallId) ?? asString(resultCarrier.id);
      const call = toolCallId ? pendingCalls.get(toolCallId) : undefined;
      if (!call) continue;
      const blocks = contentBlocks(resultCarrier);
      call.resultText = joinBlocks(blocks, "text", "text");
      call.isError = resultCarrier.isError === true;
      blocks.forEach((block, blockIndex) => {
        if (block.type === "image" && typeof block.data === "string") {
          call.images.push({
            id: `${fileBase}.${lineIndex}.${blockIndex}`,
            mimeType: asString(block.mimeType) ?? "image/png",
          });
        }
      });
      continue;
    }

    if (!message) continue;
    const timestamp = asString(message.timestamp) ?? asString(event.timestamp);
    const blocks = contentBlocks(message);

    if (message.role === "user") {
      const text = joinBlocks(blocks, "text", "text");
      if (text !== null) session.userMessages.push({ text, timestamp });
      continue;
    }

    if (message.role === "assistant") {
      const toolCalls: TranscriptToolCall[] = [];
      for (const block of blocks) {
        if (block.type !== "toolCall") continue;
        const toolUseId = asString(block.id);
        if (!toolUseId) continue;
        const call: TranscriptToolCall = {
          toolUseId,
          toolName: asString(block.toolName) ?? asString(block.name) ?? "unknown",
          params: asRecord(block.arguments) ?? asRecord(block.input) ?? {},
          resultText: null,
          isError: false,
          images: [],
        };
        toolCalls.push(call);
        pendingCalls.set(toolUseId, call);
      }
      session.turns.push({
        index: session.turns.length,
        timestamp,
        thinking: joinBlocks(blocks, "thinking", "thinking"),
        text: joinBlocks(blocks, "text", "text"),
        toolCalls,
      });
    }
  }

  return session;
}

function containerDirFor(piSessionsDir: string, containerId: string): string | null {
  if (!SAFE_SEGMENT.test(containerId)) return null;
  const dir = join(piSessionsDir, containerId);
  return existsSync(dir) && statSync(dir).isDirectory() ? dir : null;
}

function buildTranscript(piSessionsDir: string, containerId: string): ContainerTranscript | null {
  const containerDir = containerDirFor(piSessionsDir, containerId);
  if (!containerDir) return null;
  return {
    container_id: containerId,
    pi_sessions: listJsonlFiles(containerDir).map(parsePiSessionFile),
  };
}

interface ResolvedImage {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

/** Parse + validate an imageId and re-read the referenced jsonl image block. */
function resolveImage(
  piSessionsDir: string,
  containerId: string,
  imageId: string,
): ResolvedImage | null {
  const containerDir = containerDirFor(piSessionsDir, containerId);
  if (!containerDir) return null;

  // imageId = <fileBase>.<lineIndex>.<blockIndex>; fileBase is dot-free.
  const parts = imageId.split(".");
  if (parts.length !== 3) return null;
  const [fileBase, lineRaw, blockRaw] = parts;
  if (!SAFE_SEGMENT.test(fileBase) || !/^\d+$/.test(lineRaw) || !/^\d+$/.test(blockRaw)) {
    return null;
  }
  const lineIndex = Number(lineRaw);
  const blockIndex = Number(blockRaw);

  const filePath = listJsonlFiles(containerDir).find(
    (candidate) => basename(candidate) === `${fileBase}.jsonl`,
  );
  if (!filePath) return null;

  const lines = readFileSync(filePath, "utf8").split("\n");
  if (lineIndex >= lines.length) return null;
  let event: JsonRecord | null;
  try {
    event = asRecord(JSON.parse(lines[lineIndex]));
  } catch {
    return null;
  }
  if (!event) return null;
  const carrier = event.type === "message" ? asRecord(event.message) : event;
  if (!carrier) return null;
  const block = contentBlocks(carrier)[blockIndex];
  if (!block || block.type !== "image" || typeof block.data !== "string") return null;

  try {
    const decoded = Buffer.from(block.data, "base64");
    // Copy into a fresh ArrayBuffer-backed view so Response(BodyInit) typing
    // holds (Buffer views a shared ArrayBufferLike pool).
    const bytes = new Uint8Array(new ArrayBuffer(decoded.byteLength));
    bytes.set(decoded);
    return { bytes, mimeType: asString(block.mimeType) ?? "image/png" };
  } catch {
    return null;
  }
}

export interface TranscriptRouteOptions {
  /** Override for tests; defaults to the kernel's PI_SESSIONS_DIR. */
  piSessionsDir?: string;
}

export function createTranscriptRoutes(options: TranscriptRouteOptions = {}) {
  const piSessionsDir = options.piSessionsDir ?? PI_SESSIONS_DIR;

  return new Elysia()
    .get(
      // ":id" (not ":containerId"): the kernel-read routes already register
      // /sessions/:id, and Elysia's router requires one param name per segment.
      "/api/agent/kernel/sessions/:id/transcript",
      ({ params, set }) => {
        try {
          const transcript = buildTranscript(piSessionsDir, params.id);
          if (!transcript) {
            set.status = 404;
            return { error: `Kernel session ${params.id} not found` };
          }
          return transcript;
        } catch (error) {
          console.error("canvas-agent transcript error:", error);
          set.status = 500;
          return { error: "Failed to build transcript" };
        }
      },
    )
    .get(
      "/api/agent/kernel/sessions/:id/transcript/images/:imageId",
      ({ params, set }) => {
        try {
          const image = resolveImage(piSessionsDir, params.id, params.imageId);
          if (!image) {
            set.status = 404;
            return { error: `Transcript image ${params.imageId} not found` };
          }
          return new Response(image.bytes, {
            headers: {
              "content-type": image.mimeType,
              "cache-control": "max-age=3600",
            },
          });
        } catch (error) {
          console.error("canvas-agent transcript image error:", error);
          set.status = 500;
          return { error: "Failed to read transcript image" };
        }
      },
    );
}
