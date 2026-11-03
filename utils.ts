import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { siteConfig } from "./config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const intFmt = new Intl.NumberFormat("pt-BR");

export const formatBRL = (v: number) => brl.format(Number.isFinite(v) ? v : 0);
export const formatBRLCompact = (v: number) => brlCompact.format(Number.isFinite(v) ? v : 0);
export const formatInt = (v: number) => intFmt.format(v);
/** "R$ 70" para valores inteiros e "R$ 70,50" quando há centavos (textos de oferta e mensagens) */
export const formatBRLShort = (v: number) =>
  Number.isFinite(v) && Math.abs(v - Math.round(v)) < 0.005 ? `R$ ${intFmt.format(Math.round(v))}` : formatBRL(v);

/** Aceita "1.234,56", "1234,56", "1234.56" ou "R$ 10". Retorna NaN se inválido. */
export function parseMoney(input: string | number): number {
  if (typeof input === "number") return input;
  let s = input.replace(/\s|R\$/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Converte número para texto editável em campo de dinheiro: 1234.5 -> "1234,50" */
export const moneyToInput = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "" : v.toFixed(2).replace(".", ",");

// ---------- Datas no horário de Brasília ----------
// Desde 2019 o Brasil não adota horário de verão: Brasília = UTC-03:00.
export const BR_OFFSET = "-03:00";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: siteConfig.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function brParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
}

/** "2026-10-30" no fuso de Brasília */
export function brDateKey(d: Date) {
  const { y, m, d: day } = brParts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Meia-noite (Brasília) da data informada no formato YYYY-MM-DD */
export const brMidnight = (key: string) => new Date(`${key}T00:00:00${BR_OFFSET}`);

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: siteConfig.timeZone, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: siteConfig.timeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: siteConfig.timeZone, day: "2-digit", month: "short" });

export const formatDate = (iso: string | Date) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string | Date) => dateTimeFmt.format(new Date(iso)).replace(",", " às");
export const formatShortDate = (iso: string | Date) => shortDateFmt.format(new Date(iso)).replace(".", "");

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `há ${Math.floor(diff / 86400)} d`;
  return formatDate(iso);
}

/** Valor para <input type="datetime-local"> no horário de Brasília */
export function toDateTimeLocal(iso: string | Date = new Date()) {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() - 3 * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}
export const fromDateTimeLocal = (v: string) => new Date(`${v}:00${BR_OFFSET}`).toISOString();

/** 10800 -> "03:00:00" */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function firstName(full?: string | null) {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

export function initials(full?: string | null) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "EG";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Reduz e comprime uma imagem no navegador antes do envio. */
export async function compressImage(file: File, maxSize = 800, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao comprimir a imagem."))), "image/jpeg", quality),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baixa um texto como arquivo (ex.: relatório CSV). */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV no padrão brasileiro (separador ";", vírgula decimal, BOM para o Excel abrir com acentos). */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const cell = (v: string | number | null | undefined) => {
    const s = typeof v === "number" ? v.toFixed(2).replace(".", ",") : (v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

/** 3600 -> "1 hora", 5400 -> "1,5 hora", 36000 -> "10 horas" */
export function hoursLabel(seconds: number) {
  const h = Math.round((seconds / 3600) * 10) / 10;
  return `${h.toLocaleString("pt-BR")} ${h > 0 && h < 2 ? "hora" : "horas"}`;
}
