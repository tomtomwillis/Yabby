import './TravelFilters.css';

export interface UserOption {
  userId: string;
  username: string;
}

export interface CityOption {
  cityKey: string;
  label: string;
}

interface TravelFiltersProps {
  cities: CityOption[];
  users: UserOption[];
  cityFilter: string;
  userFilter: string;
  onCityChange: (cityKey: string) => void;
  onUserChange: (userId: string) => void;
}

export default function TravelFilters({
  cities,
  users,
  cityFilter,
  userFilter,
  onCityChange,
  onUserChange,
}: TravelFiltersProps) {
  const hasActive = cityFilter !== '' || userFilter !== '';

  return (
    <div className="travel-filters">
      <label className="travel-filters__field">
        <span className="travel-filters__label">City</span>
        <select
          className="travel-filters__select"
          value={cityFilter}
          onChange={(e) => onCityChange(e.target.value)}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.cityKey} value={c.cityKey}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="travel-filters__field">
        <span className="travel-filters__label">User</span>
        <select
          className="travel-filters__select"
          value={userFilter}
          onChange={(e) => onUserChange(e.target.value)}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.username}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="travel-filters__clear"
        onClick={() => {
          onCityChange('');
          onUserChange('');
        }}
        disabled={!hasActive}
      >
        Clear filters
      </button>
    </div>
  );
}
