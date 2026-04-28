'use client';

import { createClient } from '@/lib/supabase/client';

export type MemberBmBaSlot = 'hanssen' | 'kezia';

export type ClientRow = {
  id: string;
  label: string;
  /** Optional manual incentives text beside client name in the table */
  incentives: string;
};

export type MemberBmBaDetail = {
  jobDesc: string;
  clients: ClientRow[];
};

export type MemberBmBaState = Record<MemberBmBaSlot, MemberBmBaDetail>;

const STORAGE_KEY = 'task-manager.member-bm-ba-details';

const BM_BA_TABLE = 'workspace_bm_ba_settings';
const BM_BA_ROW_ID = 'default';

function isUnsettledBmBaPayload(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (Array.isArray(raw)) return true;
  if (typeof raw !== 'object') return true;
  return Object.keys(raw as Record<string, unknown>).length === 0;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function newRow(): ClientRow {
  return { id: randomId(), label: '', incentives: '' };
}

export function defaultMemberBmBaState(): MemberBmBaState {
  return {
    hanssen: { jobDesc: '', clients: [newRow()] },
    kezia: { jobDesc: '', clients: [newRow()] },
  };
}

/** Merge parsed JSON (partial/unknown) into a valid MemberBmBaState */
export function mergeParsedIntoDefault(parsed: unknown): MemberBmBaState {
  const base = defaultMemberBmBaState();
  if (!parsed || typeof parsed !== 'object') return base;
  const root = parsed as Partial<MemberBmBaState>;
  for (const slot of ['hanssen', 'kezia'] as MemberBmBaSlot[]) {
    const block = root[slot];
    if (!block || typeof block !== 'object') continue;
    if (typeof block.jobDesc === 'string') base[slot].jobDesc = block.jobDesc;
    if (Array.isArray(block.clients) && block.clients.length > 0) {
      base[slot].clients = block.clients
        .filter(
          (c) => c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string'
        )
        .map((c) => {
          const row = c as { id: string; label?: unknown; incentives?: unknown };
          return {
            id: row.id,
            label: typeof row.label === 'string' ? row.label : '',
            incentives: typeof row.incentives === 'string' ? row.incentives : '',
          };
        });
      if (base[slot].clients.length === 0) base[slot].clients = [newRow()];
    }
  }
  return base;
}

export function loadMemberBmBaFromStorage(): MemberBmBaState {
  if (typeof window === 'undefined') return defaultMemberBmBaState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMemberBmBaState();
    const parsed = JSON.parse(raw) as unknown;
    return mergeParsedIntoDefault(parsed);
  } catch {
    return defaultMemberBmBaState();
  }
}

export function saveMemberBmBaToStorage(state: MemberBmBaState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Prefer Supabase singleton row; fallback to localStorage */
export async function loadMemberBmBa(): Promise<MemberBmBaState> {
  const supabase = createClient();
  if (!supabase) return loadMemberBmBaFromStorage();
  try {
    const { data, error } = await supabase
      .from(BM_BA_TABLE)
      .select('payload')
      .eq('id', BM_BA_ROW_ID)
      .maybeSingle();
    if (
      error ||
      !data ||
      isUnsettledBmBaPayload(data.payload)
    ) {
      return loadMemberBmBaFromStorage();
    }
    const merged = mergeParsedIntoDefault(data.payload as unknown);
    saveMemberBmBaToStorage(merged);
    return merged;
  } catch {
    return loadMemberBmBaFromStorage();
  }
}

/** Mirror to localStorage; upsert Supabase when configured */
export async function saveMemberBmBaRemote(state: MemberBmBaState): Promise<void> {
  saveMemberBmBaToStorage(state);
  const supabase = createClient();
  if (!supabase) return;
  try {
    const { error } = await supabase.from(BM_BA_TABLE).upsert(
      { id: BM_BA_ROW_ID, payload: state },
      { onConflict: 'id' }
    );
    if (error) console.error('[member-bm-ba-storage]', error.message);
  } catch (e) {
    console.error('[member-bm-ba-storage] saveMemberBmBaRemote', e);
  }
}
