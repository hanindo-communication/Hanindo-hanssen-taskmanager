import { HashRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage, TasksPage } from '../pages';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="tasks" element={<TasksPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
