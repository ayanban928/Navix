import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { TripListPage } from './pages/TripListPage';
import { TripDetailsPage } from './pages/TripDetailsPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { GlobalSettings } from './pages/GlobalSettings';
import { TripProvider } from './contexts/TripContext';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <TripProvider>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/trips" element={<TripListPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<GlobalSettings />} />
            <Route path="/trips/:id" element={<TripDetailsPage />} />
            <Route path="/trips/:id/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </TripProvider>
    </BrowserRouter>
  );
}

export default App;
