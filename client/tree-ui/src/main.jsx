import React from 'react';
import {createRoot} from 'react-dom/client';
import './webshim.js'; // In web mode, forward browser invokes to /api/invoke; native Tauri is unchanged.
import App from './TreeClient.jsx';
import './styles.css';
import './depth.css';
import './tree-workspace.css';
import './diary-calendar.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
