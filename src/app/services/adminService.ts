import { supabase } from '../../supabase';
import { getMockDb, saveMockDb } from './mockDb';

// Get all students — enriched with entry_count, pending_count, approved_count
export async function getAllStudents() {
    try {
        const { data: students, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'student')
            .order('full_name');
        if (error) throw error;

        // Fetch entry counts per student in one query
        const studentIds = (students || []).map((s: any) => s.id);
        let entryCounts: Record<string, { total: number; pending: number; approved: number }> = {};
        if (studentIds.length > 0) {
            const { data: entries } = await supabase
                .from('logbook_entries')
                .select('student_id, status')
                .in('student_id', studentIds);
            (entries || []).forEach((e: any) => {
                if (!entryCounts[e.student_id]) entryCounts[e.student_id] = { total: 0, pending: 0, approved: 0 };
                entryCounts[e.student_id].total++;
                if (e.status === 'Pending') entryCounts[e.student_id].pending++;
                if (e.status === 'Approved') entryCounts[e.student_id].approved++;
            });
        }

        return (students || []).map((s: any) => ({
            ...s,
            entry_count: entryCounts[s.id]?.total ?? 0,
            pending_count: entryCounts[s.id]?.pending ?? 0,
            approved_count: entryCounts[s.id]?.approved ?? 0,
        }));
    } catch (err) {
        console.warn('Fallback to mock DB for getAllStudents');
        const db = getMockDb();
        const students = db.profiles.filter((p: any) => p.role === 'student');
        return students.map((s: any) => {
            const entries = db.logbook_entries.filter((e: any) => e.student_id === s.id);
            return {
                ...s,
                entry_count: entries.length,
                pending_count: entries.filter((e: any) => e.status === 'Pending').length,
                approved_count: entries.filter((e: any) => e.status === 'Approved').length,
            };
        });
    }
}

// Get all supervisors — enriched with assigned_count
export async function getAllSupervisors() {
    try {
        const { data: supervisors, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'supervisor')
            .order('full_name');
        if (error) throw error;

        // Count assigned students per supervisor
        const { data: assigned } = await supabase
            .from('profiles')
            .select('supervisor_id')
            .eq('role', 'student')
            .not('supervisor_id', 'is', null);
        const counts: Record<string, number> = {};
        (assigned || []).forEach((s: any) => {
            counts[s.supervisor_id] = (counts[s.supervisor_id] || 0) + 1;
        });

        return (supervisors || []).map((sup: any) => ({
            ...sup,
            assigned_count: counts[sup.id] ?? 0,
        }));
    } catch (err) {
        console.warn('Fallback to mock DB for getAllSupervisors');
        const db = getMockDb();
        const supervisors = db.profiles.filter((p: any) => p.role === 'supervisor');
        return supervisors.map((sup: any) => ({
            ...sup,
            assigned_count: db.profiles.filter((p: any) => p.role === 'student' && p.supervisor_id === sup.id).length,
        }));
    }
}

// Get students without an assigned supervisor (new registrations pending assignment)
export async function getUnassignedStudents() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'student')
            .is('supervisor_id', null)
            .order('full_name');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Fallback to mock DB for getUnassignedStudents');
        const db = getMockDb();
        return db.profiles.filter((p: any) => p.role === 'student' && !p.supervisor_id);
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

// Assign a supervisor to a student and trigger instant email + in-app notification
export async function assignSupervisor(studentId: string, supervisorId: string) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ supervisor_id: supervisorId })
            .eq('id', studentId);
        if (error) throw error;

        // Trigger instant email notification + in-app notification via Edge Function
        supabase.functions.invoke('send-reminder', {
            body: {
                assignmentNotification: {
                    studentId,
                    supervisorId,
                },
            },
        }).catch((err) => {
            console.warn('[adminService] Could not send supervisor assignment email:', err);
        });
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


// Promote or change a user's role (admin only). The DB trigger enforces this.
export async function promoteUserRole(userId: string, newRole: 'student' | 'supervisor' | 'admin') {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);
        if (error) throw error;
    } catch (err) {
        console.warn('Fallback to mock DB for promoteUserRole');
        const db = getMockDb();
        const idx = db.profiles.findIndex((p: any) => p.id === userId);
        if (idx !== -1) {
            db.profiles[idx].role = newRole;
            saveMockDb(db);
        }
    }
}

// ─── REMINDER HELPERS ─────────────────────────────────────────────────────────

/**
 * Returns all student profiles who have NOT filed any logbook entry for today.
 * Falls back to mock DB if Supabase is unavailable.
 */
export async function getStudentsMissingLogToday(): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    try {
        const { data: allStudents, error: studErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'student');
        if (studErr) throw studErr;

        const { data: todayEntries, error: entryErr } = await supabase
            .from('logbook_entries')
            .select('student_id')
            .eq('entry_date', today);
        if (entryErr) throw entryErr;

        const filedIds = new Set((todayEntries || []).map((e: any) => e.student_id));
        return (allStudents || []).filter((s: any) => !filedIds.has(s.id));
    } catch {
        console.warn('Fallback to mock DB for getStudentsMissingLogToday');
        const db = getMockDb();
        const allStudents = db.profiles.filter((p: any) => p.role === 'student');
        const filedIds = new Set(
            db.logbook_entries
                .filter((e: any) => e.entry_date === today)
                .map((e: any) => e.student_id)
        );
        return allStudents.filter((s: any) => !filedIds.has(s.id));
    }
}

/**
 * Returns supervisor profiles who have MORE THAN ONE student assigned to them.
 * Falls back to mock DB if Supabase is unavailable.
 */
export async function getSupervisorsWithMoreThanOneStudent(): Promise<any[]> {
    try {
        const { data: assignedStudents, error: studErr } = await supabase
            .from('profiles')
            .select('supervisor_id')
            .eq('role', 'student')
            .not('supervisor_id', 'is', null);
        if (studErr) throw studErr;

        // Count students per supervisor
        const counts: Record<string, number> = {};
        (assignedStudents || []).forEach((s: any) => {
            counts[s.supervisor_id] = (counts[s.supervisor_id] || 0) + 1;
        });

        // Keep only IDs where count > 1
        const qualifiedIds = Object.entries(counts)
            .filter(([, count]) => count > 1)
            .map(([id]) => id);

        if (qualifiedIds.length === 0) return [];

        const { data: supervisors, error: supErr } = await supabase
            .from('profiles')
            .select('*')
            .in('id', qualifiedIds);
        if (supErr) throw supErr;
        return supervisors || [];
    } catch {
        console.warn('Fallback to mock DB for getSupervisorsWithMoreThanOneStudent');
        const db = getMockDb();
        const counts: Record<string, number> = {};
        db.profiles
            .filter((p: any) => p.role === 'student' && p.supervisor_id)
            .forEach((p: any) => {
                counts[p.supervisor_id] = (counts[p.supervisor_id] || 0) + 1;
            });
        const qualifiedIds = new Set(
            Object.entries(counts).filter(([, c]) => c > 1).map(([id]) => id)
        );
        return db.profiles.filter((p: any) => p.role === 'supervisor' && qualifiedIds.has(p.id));
    }
}
