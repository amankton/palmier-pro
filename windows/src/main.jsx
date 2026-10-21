import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { themeVariables } from './AppTheme.js';
import './styles.css';

Object.entries(themeVariables()).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="fatal-error"><h1>Editor could not load</h1><p>{this.state.error.message}</p><p>Close and reopen Palmier Pro. Saved project files are unchanged.</p></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
