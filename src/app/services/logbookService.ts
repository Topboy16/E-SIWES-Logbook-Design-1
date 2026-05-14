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
        console.warn('Fallback to mock DB for getStudentEntries');
        const db = getMockDb();
        const entries = db.logbook_entries.filter((e: any) => e.student_id === studentId);
        return entries.sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
    }
}

// ---------- CREATE ENTRY ----------
// Inserts a new logbook entry and returns it.

export async function createEntry(studentId: string, entry: NewEntry) {
    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .insert({
                student_id: studentId,
                title: entry.title,
                description: entry.description,
                entry_date: entry.entry_date,
                hours_worked: entry.hours_worked,
                attachments: entry.attachments || [],
                status: 'Pending',
            })
            .select()
            .single();

        if (error) throw error;
        return data as LogbookEntry;
    } catch (err) {
        console.warn('Fallback to mock DB for createEntry');
        const db = getMockDb();
        const newEntry = {
            id: 'mock-entry-' + Date.now(),
            student_id: studentId,
            title: entry.title,
            description: entry.description,
            entry_date: entry.entry_date,
            hours_worked: entry.hours_worked,
            attachments: entry.attachments || [],
            status: 'Pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        db.logbook_entries.push(newEntry);
        saveMockDb(db);
        return newEntry as LogbookEntry;
    }
}

// ---------- UPDATE ENTRY ----------
// Updates an existing entry. Only works if status is 'Pending' (enforced by RLS).

export async function updateEntry(entryId: string, updates: Partial<NewEntry>) {
    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('id', entryId)
            .select()
            .single();

        if (error) throw error;
        return data as LogbookEntry;
    } catch (err) {
        console.warn('Fallback to mock DB for updateEntry');
        const db = getMockDb();
        const idx = db.logbook_entries.findIndex((e: any) => e.id === entryId);
        if (idx !== -1) {
            db.logbook_entries[idx] = { ...db.logbook_entries[idx], ...updates, updated_at: new Date().toISOString() };
            saveMockDb(db);
            return db.logbook_entries[idx];
        }
        throw new Error('Entry not found');
    }
}

// ---------- DELETE ENTRY ----------
// Deletes an entry. Only works on Pending entries (you should check before calling).

export async function deleteEntry(entryId: string) {
    try {
        const { error } = await supabase
            .from('logbook_entries')
            .delete()
            .eq('id', entryId);

        if (error) throw error;
    } catch (err) {
        console.warn('Fallback to mock DB for deleteEntry');
        const db = getMockDb();
        db.logbook_entries = db.logbook_entries.filter((e: any) => e.id !== entryId);
        saveMockDb(db);
    }
}

// ---------- GET STUDENT STATS ----------
// Calculates summary stats for the student dashboard cards.

export async function getStudentStats(studentId: string) {
    let entries = [];
    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .select('status, hours_worked')
            .eq('student_id', studentId);

        if (error) throw error;
        entries = data || [];
    } catch (err) {
        console.warn('Fallback to mock DB for getStudentStats');
        const db = getMockDb();
        entries = db.logbook_entries.filter((e: any) => e.student_id === studentId);
    }

    const totalEntries = entries.length;
    const approved = entries.filter((e: any) => e.status === 'Approved').length;
    const pending = entries.filter((e: any) => e.status === 'Pending').length;
    const totalHours = entries.reduce((sum: number, e: any) => sum + Number(e.hours_worked), 0);

    return { totalEntries, approved, pending, totalHours };
}
