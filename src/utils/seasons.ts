export type SeasonName = 'Winter' | 'Spring' | 'Summer' | 'Autumn';

export interface Season {
  name: SeasonName;
  year: number;
  start: Date;
  end: Date;
}

// Northern-meteorological seasons: Dec-Feb Winter, Mar-May Spring, Jun-Aug
// Summer, Sep-Nov Autumn. Winter spans a year boundary, so it's labelled
// with the year of its Jan/Feb portion (e.g. Dec 2026 -> "Winter 2027").
export function getCurrentSeason(date: Date = new Date()): Season {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  if (month === 11) {
    return { name: 'Winter', year: year + 1, start: new Date(year, 11, 1), end: new Date(year + 1, 2, 1) };
  }
  if (month <= 1) {
    return { name: 'Winter', year, start: new Date(year - 1, 11, 1), end: new Date(year, 2, 1) };
  }
  if (month <= 4) {
    return { name: 'Spring', year, start: new Date(year, 2, 1), end: new Date(year, 5, 1) };
  }
  if (month <= 7) {
    return { name: 'Summer', year, start: new Date(year, 5, 1), end: new Date(year, 8, 1) };
  }
  return { name: 'Autumn', year, start: new Date(year, 8, 1), end: new Date(year, 11, 1) };
}
