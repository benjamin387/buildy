import { BizsafeLevel, type BizsafeApplicationStatus, type BizsafeDocumentType, type TaskPriority } from "@prisma/client";
import type { BizsafeCertificateStatus } from "@/lib/bizsafe/status";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function formatDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatLevel(level: BizsafeLevel): string {
  switch (level) {
    case BizsafeLevel.LEVEL_1:
      return "Level 1";
    case BizsafeLevel.LEVEL_2:
      return "Level 2";
    case BizsafeLevel.LEVEL_3:
      return "Level 3";
    case BizsafeLevel.LEVEL_4:
      return "Level 4";
    case BizsafeLevel.STAR:
      return "STAR";
    default:
      return "Not Started";
  }
}

export function formatApplicationStatus(status: BizsafeApplicationStatus): string {
  return status.replaceAll("_", " ");
}

export function formatDocumentType(documentType: BizsafeDocumentType): string {
  return documentType.replaceAll("_", " ");
}

export function formatPriority(priority: TaskPriority): string {
  return priority.replaceAll("_", " ");
}

export function statusTone(status: BizsafeCertificateStatus): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "EXPIRING_SOON":
      return "warning";
    case "EXPIRED":
      return "danger";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: TaskPriority): "neutral" | "warning" | "danger" | "info" {
  switch (priority) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "info";
    default:
      return "neutral";
  }
}

export function formatCertificateStatus(status: BizsafeCertificateStatus): string {
  return status.replaceAll("_", " ");
}

