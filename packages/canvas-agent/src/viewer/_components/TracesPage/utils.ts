import type {
  KernelTraceSessionDetail,
  KernelTraceSessionListResponse,
  KernelTraceSessionSummary,
} from "@codecaine-ai/agent-kernel-viewer-core";
import { isRecord } from "../../shared/utils";

export function isTraceDetail(value: unknown): value is KernelTraceSessionDetail {
  return (
    isRecord(value) &&
    isRecord(value.session) &&
    Array.isArray(value.events) &&
    Array.isArray(value.pi_sessions) &&
    Array.isArray(value.agent_runs)
  );
}

export function extractSessions(data: unknown): KernelTraceSessionSummary[] | null {
  if (!isRecord(data) || !Array.isArray(data.trace_sessions)) return null;
  return (data as unknown as KernelTraceSessionListResponse).trace_sessions;
}
