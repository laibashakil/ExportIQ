import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { Icon } from '../components/Icon.jsx';
import { API_BASE_URL } from '../constants/config';

const STORAGE_KEY = 'exportiq.settings.v1';
const DEFAULTS = {
  ownerName: 'Muhammad Tariq Malik',
  contactEmail: '',
  notifyDeadlines: true,
  notifyAuditReminders: true,
  notifyNews: false,
};
const SUPPORT_EMAIL = 'support@exportiq.app';
const APP_VERSION = '0.1.0';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export default function Settings() {
  const nav = useNavigate();
  const [settings, setSettings] = useState(DEFAULTS);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function save(next) {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  async function onExportPdf() {
    try {
      setExporting(true);
      window.open(`${API_BASE_URL}/export-summary`, '_blank');
    } finally {
      setTimeout(() => setExporting(false), 1500);
    }
  }

  return (
    <div className="app-shell">
      <Header />
      <button className="back-btn" onClick={() => nav(-1)}>
        <Icon name="chevron-left" size={14} /> Back
      </button>

      <div className="section-label">Profile</div>
      <div className="settings-card">
        <label className="settings-field">
          <span className="settings-field-label">Factory owner name</span>
          <input
            type="text"
            value={settings.ownerName}
            onChange={(e) => save({ ...settings, ownerName: e.target.value })}
            className="settings-input"
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Contact email</span>
          <input
            type="email"
            value={settings.contactEmail}
            onChange={(e) => save({ ...settings, contactEmail: e.target.value })}
            placeholder="you@example.com"
            className="settings-input"
          />
        </label>
      </div>

      <div className="section-label">Notifications</div>
      <div className="settings-card">
        <ToggleRow
          label="Deadline reminders"
          value={settings.notifyDeadlines}
          onChange={(v) => save({ ...settings, notifyDeadlines: v })}
        />
        <ToggleRow
          label="Audit reminders"
          value={settings.notifyAuditReminders}
          onChange={(v) => save({ ...settings, notifyAuditReminders: v })}
        />
        <ToggleRow
          label="News updates"
          value={settings.notifyNews}
          onChange={(v) => save({ ...settings, notifyNews: v })}
          last
        />
      </div>

      <div className="section-label">Reports</div>
      <button className="action-card" onClick={onExportPdf} disabled={exporting}>
        <div className="action-icon-wrap">
          <Icon name="download" size={20} color="#00D4AA" />
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div className="action-title">
            {exporting ? 'Generating PDF…' : 'Export Compliance Report as PDF'}
          </div>
          <div className="action-sub">
            Summary of all 3 factories' status, ready to share with stakeholders.
          </div>
        </div>
        <Icon name="chevron-right" size={16} color="#9BA3AF" />
      </button>

      <div className="section-label">About</div>
      <div className="settings-card">
        <div className="about-row">
          <span className="about-k">App version</span>
          <span className="about-v">{APP_VERSION}</span>
        </div>
        <div className="about-row last">
          <span className="about-k">Platform</span>
          <span className="about-v">Web (Firebase Hosting)</span>
        </div>
      </div>

      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=ExportIQ%20support`}
        className="support-btn"
      >
        <Icon name="mail" size={14} color="#00D4AA" />
        Contact support · {SUPPORT_EMAIL}
      </a>
    </div>
  );
}

function ToggleRow({ label, value, onChange, last }) {
  return (
    <div className={`toggle-row ${last ? 'last' : ''}`}>
      <span>{label}</span>
      <button
        className={`toggle-switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}
