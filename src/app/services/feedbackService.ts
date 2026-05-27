import { supabase } from '../../supabase';
import { getMockDb, saveMockDb } from './mockDb';

export interface Feedback {
    id: string;
    entry_id: string;
    supervisor_id: string;
    comment: string;
    created_at: string;
    // Joined data from profiles table
    supervisor?: {
        full_name: string;
    };
}

// Get all feedback for a student's entries
export async function getStudentFeedback(studentId: string) {
    try {
        const { data, error } = await supabase
            .from('feedback')
            .select(`
          *,
          supervisor:profiles!supervisor_id(full_name),
          entry:logbook_entries!entry_id(title, entry_date)
        `)
            .in(
                'entry_id',
                // Subquery: get all entry IDs belonging to this student
                (await supabase
                    .from('logbook_entries')
                    .select('id')
                    .eq('student_id', studentId)
                ).data?.map(e => e.id) || []
            )
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Fallback to mock DB for getStudentFeedback');
        const db = getMockDb();
        const studentEntries = db.logbook_entries.filter((e: any) => e.student_id === studentId);
        const entryIds = studentEntries.map((e: any) => e.id);
        const feedback = db.feedback.filter((f: any) => entryIds.includes(f.entry_id));
        return feedback.map((f: any) => {
            const supervisor = db.profiles.find((p: any) => p.id === f.supervisor_id);
            const entry = studentEntries.find((e: any) => e.id === f.entry_id);
            return {
                ...f,
                supervisor: supervisor ? { full_name: supervisor.full_name } : null,
                entry: entry ? { title: entry.title, entry_date: entry.entry_date } : null
            };
        }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
}

// Supervisor: add feedback to an entry
export async function addFeedback(entryId: string, supervisorId: string, comment: string) {
    try {
        const { data, error } = await supabase
            .from('feedback')
            .insert({
                entry_id: entryId,
                supervisor_id: supervisorId,
                comment,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Fallback to mock DB for addFeedback');
        const db = getMockDb();
        const newFeedback = {
            id: 'mock-feedback-' + Date.now(),
            entry_id: entryId,
            supervisor_id: supervisorId,
            comment,
            created_at: new Date().toISOString()
        };
        db.feedback.push(newFeedback);
        saveMockDb(db);
        return newFeedback;
    }
}

// Supervisor: update entry status (approve/reject)
export async function updateEntryStatus(entryId: string, status: 'Approved' | 'Rejected') {
    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', entryId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Fallback to mock DB for updateEntryStatus');
        const db = getMockDb();
        const idx = db.logbook_entries.findIndex((e: any) => e.id === entryId);
        if (idx !== -1) {
            db.logbook_entries[idx].status = status;
            db.logbook_entries[idx].updated_at = new Date().toISOString();
            saveMockDb(db);
            return db.logbook_entries[idx];
        }
        throw new Error('Entry not found');
    }
}

// Supervisor: get all pending entries for their assigned students
export async function getSupervisorPendingEntries(supervisorId: string) {
    try {
        // First, get students assigned to this supervisor
        const { data: students, error: studentsError } = await supabase
            .from('profiles')
            .select('id, full_name, department')
            .eq('supervisor_id', supervisorId);

        if (studentsError) throw studentsError;

        const studentIds = students?.map(s => s.id) || [];
        if (studentIds.length === 0) return [];

        // Then get pending entries from those students
        const { data: entries, error: entriesError } = await supabase
            .from('logbook_entries')
            .select('*')
            .in('student_id', studentIds)
            .eq('status', 'Pending')
            .order('entry_date', { ascending: false });

        if (entriesError) throw entriesError;

        // Combine student names with entries
        return (entries || []).map(entry => {
            const student = students?.find(s => s.id === entry.student_id);
            return {
                ...entry,
                student_name: student?.full_name || 'Unknown',
                student_department: student?.department || '',
            };
        });
    } catch (err) {
        console.warn('Fallback to mock DB for getSupervisorPendingEntries');
        const db = getMockDb();
        const students = db.profiles.filter((p: any) => p.supervisor_id === supervisorId);
        const studentIds = students.map((s: any) => s.id);
        const pendingEntries = db.logbook_entries.filter((e: any) => studentIds.includes(e.student_id) && e.status === 'Pending');

        return pendingEntries.map((entry: any) => {
            const student = students.find((s: any) => s.id === entry.student_id);
            return {
                ...entry,
                student_name: student?.full_name || 'Unknown',
                student_department: student?.department || '',
            };
        }).sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
    }
}

// Supervisor: get all students assigned to this supervisor
export async function getSupervisorStudents(supervisorId: string) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('supervisor_id', supervisorId)
            .order('full_name');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Fallback to mock DB for getSupervisorStudents');
        const db = getMockDb();
        return db.profiles.filter((p: any) => p.supervisor_id === supervisorId);
    }
}

// Supervisor: get all reviewed entries (Approved / Rejected) for their assigned students
export async function getSupervisorReviewedEntries(supervisorId: string) {
    try {
        const students = await getSupervisorStudents(supervisorId);
        const studentIds = students.map((s: any) => s.id);
        if (studentIds.length === 0) return [];

        const { data, error } = await supabase
            .from('logbook_entries')
            .select('*')
            .in('student_id', studentIds)
            .in('status', ['Approved', 'Rejected'])
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((entry: any) => {
            const student = students.find((s: any) => s.id === entry.student_id);
            return {
                ...entry,
                student_name: student?.full_name || 'Unknown',
            };
        });
    } catch (err) {
        console.warn('Fallback to mock DB for getSupervisorReviewedEntries');
        const db = getMockDb();
        const students = db.profiles.filter((p: any) => p.supervisor_id === supervisorId);
        const studentIds = students.map((s: any) => s.id);
        const reviewed = db.logbook_entries.filter(
            (e: any) => studentIds.includes(e.student_id) && ['Approved', 'Rejected'].includes(e.status)
        );
        return reviewed.map((entry: any) => {
            const student = students.find((s: any) => s.id === entry.student_id);
            return {
                ...entry,
                student_name: student?.full_name || 'Unknown',
            };
        }).sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
}

