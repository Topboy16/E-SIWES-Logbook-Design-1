export const getMockDb = () => {
  const defaultDb = {
    profiles: [],
    logbook_entries: [],
    feedback: [],
    notifications: [],
  };
  const stored = localStorage.getItem('esiwes_mock_db');
  return stored ? JSON.parse(stored) : defaultDb;
};

// Seed a default admin account if none exists in the mock DB.
// Call this once at app startup. The admin still needs a real Supabase auth
// account — this just ensures the profile/role mapping is in place.
export function seedAdminIfNeeded(adminEmail: string) {
  const db = getMockDb();
  const hasAdmin = db.profiles.some((p: any) => p.role === 'admin');
  if (!hasAdmin) {
    db.profiles.push({
      id: 'admin-seed-' + Date.now(),
      email: adminEmail,
      role: 'admin',
      full_name: 'System Administrator',
      department: 'Administration',
    });
    saveMockDb(db);
    console.log('Seeded default admin profile for:', adminEmail);
  }
}

export const saveMockDb = (db: any) => {
  localStorage.setItem('esiwes_mock_db', JSON.stringify(db));
};

export const clearMockDb = () => {
  localStorage.removeItem('esiwes_mock_db');
};
