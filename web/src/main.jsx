import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import FactoryDetail from './pages/FactoryDetail.jsx';
import HowItWorks from './pages/HowItWorks.jsx';
import Deadlines from './pages/Deadlines.jsx';
import Settings from './pages/Settings.jsx';
import Upload from './pages/Upload.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/factory/:factoryId" element={<FactoryDetail />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/upload/:factoryId" element={<Upload />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/deadlines" element={<Deadlines />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
