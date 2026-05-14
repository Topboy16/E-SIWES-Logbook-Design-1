export const getMockDb = () => {
  const defaultDb = {
    profiles: [],
    logbook_entries: [],
    feedback: [],
  };
  const stored = localStorage.getItem('esiwes_mock_db');
  return stored ? JSON.parse(stored) : defaultDb;
};

export const saveMockDb = (db: any) => {
  localStorage.setItem('esiwes_mock_db', JSON.stringify(db));
};

export const clearMockDb = () => {
  localStorage.removeItem('esiwes_mock_db');
};
