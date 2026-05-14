import { supabase } from '../../supabase';
import { getMockDb, saveMockDb } from './mockDb';

// Get all students
export async function getAllStudents() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'student')
            .order('full_name');
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Fallback to mock DB for getAllStudents');
        const db = getMockDb();
        return db.profiles.filter((p: any) => p.role === 'student');
    }
}

// Get all supervisors
export async function getAllSupervisors() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'supervisor')
            .order('full_name');
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Fallback to mock DB for getAllSupervisors');
        const db = getMockDb();
        return db.profiles.filter((p: any) => p.role === 'supervisor');
    }
}

// Get all entries (admin sees everything)
export async function getAllEntries() {
    try {
        const { data, error } = await supabase
            .from('logbook_entries')
            .select('*, student:profiles!student_id(full_name, department)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('Fallback to mock DB for getAllEntries');
        const db = getMockDb();
        return db.logbook_entries.map((e: any) => {
            const student = db.profiles.find((p: any) => p.id === e.student_id);
            return {
                ...e,
                student: student ? { full_name: student.full_name, department: student.department } : null
            };
        }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
}

// Get system-wide stats
export async function getSystemStats() {
    try {
        const [students, supervisors, entries] = await Promise.all([
            supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student'),
            supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'supervisor'),
            supabase.from('logbook_entries').select('status'),
        ]);

        const allEntries = entries.data || [];
        return {
            totalStudents: students.count || 0,
            totalSupervisors: supervisors.count || 0,
            pendingApprovals: allEntries.filter(e => e.status === 'Pending').length,
            completedLogs: allEntries.filter(e => e.status === 'Approved').length,
        };
    } catch (err) {
        console.warn('Fallback to mock DB for getSystemStats');
        const db = getMockDb();
        const allEntries = db.logbook_entries;
        return {
            totalStudents: db.profiles.filter((p: any) => p.role === 'student').length,
            totalSupervisors: db.profiles.filter((p: any) => p.role === 'supervisor').length,
            pendingApprovals: allEntries.filter((e: any) => e.status === 'Pending').length,
            completedLogs: allEntries.filter((e: any) => e.status === 'Approved').length,
        };
    }
}

// Assign a supervisor to a student
export async function assignSupervisor(studentId: string, supervisorId: string) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ supervisor_id: supervisorId })
            .eq('id', studentId);
        if (error) throw error;
    } catch (err) {
        console.warn('Fallback to mock DB for assignSupervisor');
        const db = getMockDb();
        const idx = db.profiles.findIndex((p: any) => p.id === studentId);
        if (idx !== -1) {
            db.profiles[idx].supervisor_id = supervisorId;
            saveMockDb(db);
        }
    }
}
