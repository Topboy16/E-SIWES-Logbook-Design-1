import { supabase } from '../../supabase';
import { getMockDb, saveMockDb } from './mockDb';
import { Attachment } from './fileUploadService';

// ---------- TYPES ----------

export interface LogbookEntry {
    id: string;
    student_id: string;
    title: string;
    description: string;
    entry_date: string;
    hours_worked: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    attachments: Attachment[];
    created_at: string;
    updated_at: string;
}

export interface NewEntry {
    title: string;
    description: string;
    entry_date: string;
    hours_worked: number;
    attachments?: Attachment[];
}

// ---------- HELPERS ----------

/**
 * Returns true only for genuine network/connectivity failures.
 * RLS rejections, auth errors, and schema errors are NOT network failures —
 * they must surface to the user rather than silently falling back to mock data.
 */
function isNetworkError(err: unknown): boolean {
    if (err instanceof TypeError) return true; // "Failed to fetch"
    const msg = (err as any)?.message ?? '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return true;
    // If Supabase URL is the placeholder, we are in offline dev mode
    const url = import.meta.env.VITE_SUPABASE_URL ?? '';
    return url.includes('placeholder');
}

// ---------- FETCH ENTRIES ----------
// Gets all logbook entries for a specific student, newest first.

export async function getStudentEntries(studentId: string) {
    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .select('*')
            .eq('student_id', studentId)
            .order('entry_date', { ascending: false });

        if (error) throw error;
        return data as LogbookEntry[];
    } catch (err) {
        if (!isNetworkError(err)) throw err; // Surface Supabase/RLS errors
        console.warn('[logbookService] Network unavailable — reading from offline mock');
        const db = getMockDb();
        const entries = db.logbook_entries.filter((e: any) => e.student_id === studentId);
        return entries.sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
    }
}

// ---------- CREATE ENTRY ----------
// Inserts a new logbook entry and returns it.

export async function createEntry(studentId: string, entry: NewEntry) {
    // Client-side validation
    if (!entry.title?.trim()) throw new Error('Entry title is required.');
    if (!entry.entry_date) throw new Error('Entry date is required.');
    const hours = Number(entry.hours_worked);
    if (isNaN(hours) || hours < 0 || hours > 24) throw new Error('Hours worked must be between 0 and 24.');

    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .insert({
                student_id: studentId,
                title: entry.title.trim(),
                description: entry.description,
                entry_date: entry.entry_date,
                hours_worked: hours,
                attachments: entry.attachments || [],
                status: 'Pending',
            })
            .select()
            .single();

        if (error) throw error;
        return data as LogbookEntry;
    } catch (err) {
        if (!isNetworkError(err)) throw err; // Surface Supabase/RLS errors
        console.warn('[logbookService] Network unavailable — writing to offline mock');
        const db = getMockDb();
        const newEntry = {
            id: 'mock-entry-' + Date.now(),
            student_id: studentId,
            title: entry.title.trim(),
            description: entry.description,
            entry_date: entry.entry_date,
            hours_worked: hours,
            attachments: entry.attachments || [],
            status: 'Pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        db.logbook_entries.push(newEntry);
        saveMockDb(db);
        return newEntry as LogbookEntry;
    }
}

// ---------- UPDATE ENTRY ----------
// Updates a Pending entry. Supabase RLS enforces the Pending-only constraint.

export async function updateEntry(entryId: string, updates: Partial<NewEntry>) {
    const hours = updates.hours_worked !== undefined ? Number(updates.hours_worked) : undefined;
    if (hours !== undefined && (isNaN(hours) || hours < 0 || hours > 24)) {
        throw new Error('Hours worked must be between 0 and 24.');
    }

    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .update({ ...updates, ...(hours !== undefined ? { hours_worked: hours } : {}), updated_at: new Date().toISOString() })
            .eq('id', entryId)
            .select()
            .single();

        if (error) throw error;
        return data as LogbookEntry;
    } catch (err) {
        if (!isNetworkError(err)) throw err; // Surface RLS rejections (e.g. entry already approved)
        console.warn('[logbookService] Network unavailable — updating offline mock');
        const db = getMockDb();
        const idx = db.logbook_entries.findIndex((e: any) => e.id === entryId);
        if (idx === -1) throw new Error('Entry not found.');
        // Enforce status check in mock too
        if (db.logbook_entries[idx].status !== 'Pending') {
            throw new Error('Cannot edit an entry that has already been reviewed.');
        }
        db.logbook_entries[idx] = { ...db.logbook_entries[idx], ...updates, updated_at: new Date().toISOString() };
        saveMockDb(db);
        return db.logbook_entries[idx];
    }
}

// ---------- DELETE ENTRY ----------
// Deletes a Pending entry. RLS enforces the Pending-only constraint.

export async function deleteEntry(entryId: string) {
    try {
        const { error } = await supabase
            .from('logbook_entries')
            .delete()
            .eq('id', entryId);

        if (error) throw error;
    } catch (err) {
        if (!isNetworkError(err)) throw err; // Surface RLS rejections
        console.warn('[logbookService] Network unavailable — deleting from offline mock');
        const db = getMockDb();
        const entry = db.logbook_entries.find((e: any) => e.id === entryId);
        if (entry && entry.status !== 'Pending') {
            throw new Error('Cannot delete an entry that has already been reviewed.');
        }
        db.logbook_entries = db.logbook_entries.filter((e: any) => e.id !== entryId);
        saveMockDb(db);
    }
}

// ---------- GET STUDENT STATS ----------
// Computes summary stats — derived from getStudentEntries to avoid a second DB round-trip.

export async function getStudentStats(studentId: string) {
    // Reuse the already-fetched entries to avoid a duplicate query
    const entries = await getStudentEntries(studentId);
    const totalEntries = entries.length;
    const approved    = entries.filter((e) => e.status === 'Approved').length;
    const pending     = entries.filter((e) => e.status === 'Pending').length;
    const totalHours  = entries.reduce((sum, e) => sum + Number(e.hours_worked), 0);
    return { totalEntries, approved, pending, totalHours };
}
